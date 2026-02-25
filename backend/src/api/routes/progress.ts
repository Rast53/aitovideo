import { Router, type Request, type Response } from 'express';
import db from '../../db.js';
import { UserModel } from '../../models/user.js';
import type {
  ErrorResponse,
  GetProgressResponse,
  SaveProgressRequestBody,
  SaveProgressResponse,
  VideoProgress
} from '../../types/api.js';

const router = Router();

// Get progress for a specific video
router.get(
  '/:video_id',
  (
    req: Request<{ video_id: string }>,
    res: Response<GetProgressResponse | ErrorResponse>
  ): void => {
    try {
      const telegramId = req.telegramUser?.id;

      if (!telegramId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const user = UserModel.findByTelegramId(telegramId);
      if (!user) {
        res.json({ progress: null });
        return;
      }

      const videoId = Number.parseInt(req.params.video_id, 10);
      if (Number.isNaN(videoId)) {
        res.status(400).json({ error: 'Invalid video_id' });
        return;
      }

      const progress = db
        .prepare('SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?')
        .get(user.id, videoId) as VideoProgress | undefined;

      res.json({ progress: progress ?? null });
    } catch (error) {
      console.error('Get progress error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Save (upsert) progress for a video
router.post(
  '/',
  (
    req: Request<Record<string, never>, SaveProgressResponse | ErrorResponse, SaveProgressRequestBody>,
    res: Response<SaveProgressResponse | ErrorResponse>
  ): void => {
    try {
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

      const { video_id, position_seconds } = req.body;

      if (typeof video_id !== 'number' || typeof position_seconds !== 'number') {
        res.status(400).json({ error: 'Missing video_id or position_seconds' });
        return;
      }

      if (position_seconds < 0) {
        res.status(400).json({ error: 'position_seconds must be non-negative' });
        return;
      }

      db.prepare(`
        INSERT INTO video_progress (user_id, video_id, position_seconds, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, video_id) DO UPDATE SET
          position_seconds = excluded.position_seconds,
          updated_at = CURRENT_TIMESTAMP
      `).run(user.id, video_id, Math.floor(position_seconds));

      const progress = db
        .prepare('SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?')
        .get(user.id, video_id) as VideoProgress;

      res.json({ progress });
    } catch (error) {
      console.error('Save progress error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
