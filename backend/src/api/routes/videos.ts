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
      console.error('Get videos error:', error);
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
        console.error('Failed to get video info:', error);
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

      // If YouTube, find alternatives in background
      if (parsed.platform === 'youtube') {
        void findAlternatives(videoInfo.title, user.id);
      }

      res.status(201).json({ video });
    } catch (error) {
      console.error('Add video error:', getErrorMessage(error));
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

async function findAlternatives(query: string, userId: number) {
  try {
    // Search both platforms
    const [vkAlts, rutubeAlts] = await Promise.all([
      vk.searchVkVideos(query, 2),
      rutube.searchRutubeVideos(query, 2)
    ]);

    const allAlts = [
      ...vkAlts.map((v) => ({ ...v, platform: 'vk' as const })),
      ...rutubeAlts.map((v) => ({ ...v, platform: 'rutube' as const }))
    ];

    for (const alt of allAlts) {
      if (!alt.externalId) {
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
        title: `[ALT] ${alt.title}`,
        channelName: alt.channelName,
        thumbnailUrl: alt.thumbnailUrl,
        duration: alt.duration
      });
    }
  } catch (err) {
    console.warn('[AltSearch] Background search failed:', err);
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
      console.error('Delete video error:', error);
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
      console.error('Update video error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
