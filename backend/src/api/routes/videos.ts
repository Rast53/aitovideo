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
import type { BaseVideoInfo } from '../../types/video.js';
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

async function findAlternatives(query: string, originalChannel: string, userId: number, parentId: number) {
  try {
    apiLogger.info({ query, parentId }, 'Starting background search for alternatives');
    
    // Split query by common delimiters to try shorter versions if full title fails
    const queryParts = query.split(/[?|.!]/).map(p => p.trim()).filter(p => p.length > 5);
    const searchQueries = [query, queryParts[0]].filter(Boolean);

    let allFound: any[] = [];
    
    for (const q of searchQueries) {
      if (!q) continue;
      const [vkAlts, rutubeAlts] = await Promise.all([
        vk.searchVkVideos(q, 3),
        rutube.searchRutubeVideos(q, 3)
      ]);
      
      allFound = [
        ...allFound,
        ...vkAlts.map((v) => ({ ...v, platform: 'vk' as const })),
        ...rutubeAlts.map((v) => ({ ...v, platform: 'rutube' as const }))
      ];
      
      if (allFound.length > 0) break; // Found something, stop refining
    }

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-zа-я0-9]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const targetWords = normalize(originalChannel);
    const titleWords = normalize(query);

    for (const alt of allFound) {
      if (!alt.externalId) {
        continue;
      }

      // 1. Channel match check
      const candidateChannelWords = normalize(alt.channelName || '');
      const isChannelMatch =
        targetWords.length === 0 ||
        candidateChannelWords.length === 0 ||
        targetWords.some((w) => candidateChannelWords.includes(w));

      // 2. Title fallback check (if channel doesn't match, at least 50% of title words should)
      const altTitleWords = normalize(alt.title || '');
      const matchedTitleWords = titleWords.filter(w => altTitleWords.includes(w));
      const isTitleMatch = matchedTitleWords.length >= Math.ceil(titleWords.length * 0.4);

      if (!isChannelMatch && !isTitleMatch) {
        continue;
      }

      // Skip if already exists
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
      apiLogger.info({ title: alt.title, platform: alt.platform }, 'Added alternative video');
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
