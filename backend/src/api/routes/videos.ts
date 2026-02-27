import { Router, type Request, type Response } from 'express';
import { UserModel } from '../../models/user.js';
import { VideoModel } from '../../models/video.js';
import { parseVideoUrl } from '../../services/parser.js';
import * as rutube from '../../services/rutube.js';
import * as vk from '../../services/vk.js';
import * as youtube from '../../services/youtube.js';
import type {
  AddVideoRequestBody,
  AddVideoResponse,
  DeleteVideoResponse,
  ErrorResponse,
  GetVideosResponse,
  UpdateVideoRequestBody,
  UpdateVideoResponse
} from '../../types/api.js';
import type { BaseVideoInfo, VideoPlatform } from '../../types/video.js';
import { apiLogger } from '../../logger.js';

const router = Router();

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// Get all videos for current user
router.get(
  '/',
  async (req: Request, res: Response<GetVideosResponse | ErrorResponse>): Promise<void> => {
    try {
      const telegramId = req.telegramUser?.id;

      if (!telegramId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = UserModel.findByTelegramId(telegramId);
      if (!user) {
        res.json({ videos: [] });
        return;
      }

      const videos = VideoModel.findByUserId(user.id);
      res.json({ videos });
    } catch (error) {
      apiLogger.error({ error: getErrorMessage(error) }, 'Get videos error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Add new video (called from bot)
router.post(
  '/',
  async (
    req: Request<Record<string, never>, AddVideoResponse | ErrorResponse, AddVideoRequestBody>,
    res: Response<AddVideoResponse | ErrorResponse>
  ): Promise<void> => {
    try {
      const { url, telegramId, username, firstName, lastName } = req.body;

      if (!url || !telegramId) {
        res.status(400).json({ error: 'Missing url or telegramId' });
        return;
      }

      // Parse URL
      const parsed = parseVideoUrl(url);
      if (!parsed) {
        res.status(400).json({ error: 'Unsupported URL format' });
        return;
      }

      // Get or create user
      const user = UserModel.upsert({
        telegramId,
        username,
        firstName,
        lastName
      });

      // Check if already exists
      if (VideoModel.exists(user.id, parsed.platform, parsed.externalId)) {
        res.status(409).json({ error: 'Video already in queue' });
        return;
      }

      // Get video info based on platform
      let videoInfo: BaseVideoInfo;
      try {
        switch (parsed.platform) {
          case 'youtube':
            videoInfo = await youtube.getYouTubeInfo(parsed.externalId);
            break;
          case 'rutube':
            videoInfo = await rutube.getRutubeInfo(parsed.externalId);
            break;
          case 'vk': {
            const [ownerId, videoId] = parsed.externalId.split('_');
            if (!ownerId || !videoId) {
              throw new Error('Invalid VK external id');
            }

            videoInfo = await vk.getVkVideoInfo(ownerId, videoId);
            break;
          }
          default:
            throw new Error('Unknown platform');
        }
      } catch (error) {
        apiLogger.warn({ error: getErrorMessage(error), platform: parsed.platform }, 'Failed to get video info');
        // Use default info
        videoInfo = {
          title: 'Unknown Video',
          channelName: 'Unknown',
          thumbnailUrl: null,
          duration: null
        };
      }

      // Save video
      const video = VideoModel.create({
        userId: user.id,
        platform: parsed.platform,
        externalId: parsed.externalId,
        url: parsed.url,
        title: videoInfo.title,
        channelName: videoInfo.channelName,
        thumbnailUrl: videoInfo.thumbnailUrl,
        duration: videoInfo.duration
      });

      if (!video) {
        throw new Error('Failed to create video record');
      }

      // If YouTube, find alternatives in background
      if (parsed.platform === 'youtube') {
        void findAlternatives(videoInfo.title, videoInfo.channelName, user.id, video.id);
      }

      res.status(201).json({ video });
    } catch (error) {
      apiLogger.error({ 
        error: getErrorMessage(error), 
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body 
      }, 'Add video error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ─── Fuzzy-match helpers ───────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(s: string): string[] {
  return normalizeForMatch(s).split(' ').filter((w) => w.length > 2);
}

/**
 * Fuzzy channel comparison: exact containment, word overlap, and Levenshtein
 * similarity on the full normalized strings. Returns 0–1 score.
 */
function channelSimilarity(original: string, candidate: string): number {
  const a = normalizeForMatch(original);
  const b = normalizeForMatch(candidate);

  if (!a || !b) return 0;
  if (a === b) return 1;

  // Containment check (one is a substring of the other)
  if (a.includes(b) || b.includes(a)) return 0.85;

  // Full-string Levenshtein similarity
  const fullSim = stringSimilarity(a, b);

  // Word-level overlap (Jaccard-like)
  const aWords = tokenize(original);
  const bWords = tokenize(candidate);
  if (aWords.length === 0 || bWords.length === 0) return fullSim;

  let wordMatches = 0;
  for (const w of aWords) {
    if (bWords.some((bw) => bw === w || stringSimilarity(w, bw) >= 0.75)) {
      wordMatches++;
    }
  }
  const wordSim = wordMatches / Math.max(aWords.length, bWords.length);

  return Math.max(fullSim, wordSim);
}

function titleOverlapScore(original: string, candidate: string): number {
  const origWords = tokenize(original);
  const candWords = tokenize(candidate);
  if (origWords.length === 0) return 0;

  let matches = 0;
  for (const w of origWords) {
    if (candWords.some((cw) => cw === w || stringSimilarity(w, cw) >= 0.8)) {
      matches++;
    }
  }
  return matches / origWords.length;
}

// ─── AltSearch ─────────────────────────────────────────────────────────────

interface AltCandidate extends BaseVideoInfo {
  platform: VideoPlatform;
  externalId: string;
}

const CHANNEL_SIM_THRESHOLD = 0.45;
const TITLE_OVERLAP_THRESHOLD = 0.4;

async function findAlternatives(query: string, originalChannel: string, userId: number, parentId: number) {
  try {
    apiLogger.info({ query, parentId }, 'Starting background search for alternatives');

    const queryParts = query.split(/[?|.!]/).map(p => p.trim()).filter(p => p.length > 5);
    const searchQueries = [query, queryParts[0]].filter(Boolean);

    let allFound: AltCandidate[] = [];

    for (const q of searchQueries) {
      if (!q) continue;
      const [vkAlts, rutubeAlts] = await Promise.all([
        vk.searchVkVideos(q, 3),
        rutube.searchRutubeVideos(q, 3)
      ]);

      const vkCandidates: AltCandidate[] = vkAlts
        .filter((v) => v.externalId)
        .map((v) => ({ ...v, externalId: v.externalId!, platform: 'vk' as const }));

      const rutubeCandidates: AltCandidate[] = rutubeAlts
        .filter((v) => v.externalId)
        .map((v) => ({ ...v, externalId: v.externalId!, platform: 'rutube' as const }));

      allFound = [...allFound, ...vkCandidates, ...rutubeCandidates];
      if (allFound.length > 0) break;
    }

    // Score and sort candidates
    const scored = allFound.map((alt) => {
      const chSim = channelSimilarity(originalChannel, alt.channelName || '');
      const titleOvr = titleOverlapScore(query, alt.title || '');
      return { alt, chSim, titleOvr, score: chSim * 0.4 + titleOvr * 0.6 };
    });

    scored.sort((a, b) => b.score - a.score);

    for (const { alt, chSim, titleOvr } of scored) {
      const isChannelOk = chSim >= CHANNEL_SIM_THRESHOLD;
      const isTitleOk = titleOvr >= TITLE_OVERLAP_THRESHOLD;

      if (!isChannelOk && !isTitleOk) {
        apiLogger.debug(
          { title: alt.title, chSim: chSim.toFixed(2), titleOvr: titleOvr.toFixed(2) },
          'Skipping alt: below thresholds'
        );
        continue;
      }

      if (VideoModel.exists(userId, alt.platform, alt.externalId)) {
        continue;
      }

      VideoModel.create({
        userId,
        platform: alt.platform,
        externalId: alt.externalId,
        url:
          alt.platform === 'vk'
            ? `https://vk.com/video${alt.externalId}`
            : `https://rutube.ru/video/${alt.externalId}/`,
        title: alt.title,
        channelName: alt.channelName,
        thumbnailUrl: alt.thumbnailUrl,
        duration: alt.duration,
        parentId
      });
      apiLogger.info(
        { title: alt.title, platform: alt.platform, chSim: chSim.toFixed(2), titleOvr: titleOvr.toFixed(2) },
        'Added alternative video'
      );
    }
  } catch (err) {
    apiLogger.warn({ error: getErrorMessage(err) }, '[AltSearch] Background search failed');
  }
}

// Delete video
router.delete(
  '/:id',
  async (
    req: Request<{ id: string }>,
    res: Response<DeleteVideoResponse | ErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const telegramId = req.telegramUser?.id;

      if (!telegramId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = UserModel.findByTelegramId(telegramId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const success = VideoModel.delete(Number.parseInt(id, 10), user.id);

      if (!success) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      apiLogger.error({ error: getErrorMessage(error) }, 'Delete video error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Mark as watched
router.patch(
  '/:id',
  async (
    req: Request<{ id: string }, UpdateVideoResponse | ErrorResponse, UpdateVideoRequestBody>,
    res: Response<UpdateVideoResponse | ErrorResponse>
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { isWatched } = req.body;
      const telegramId = req.telegramUser?.id;

      if (!telegramId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = UserModel.findByTelegramId(telegramId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const video = VideoModel.markAsWatched(Number.parseInt(id, 10), user.id, isWatched);

      if (!video) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }

      res.json({ video });
    } catch (error) {
      apiLogger.error({ error: getErrorMessage(error) }, 'Update video error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
