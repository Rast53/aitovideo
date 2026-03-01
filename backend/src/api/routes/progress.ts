import { Router, type Request, type Response } from 'express';
import db from '../../db.js';
import { UserModel } from '../../models/user.js';
import { apiLogger } from '../../logger.js';
import type {
  ErrorResponse,
  GetProgressResponse,
  SaveProgressRequestBody,
  SaveProgressResponse,
  VideoProgress
} from '../../types/api.js';

const router = Router();

/**
 * Resolve the canonical video id for progress storage.
 * If video has parent_id and the parent row still exists → return parent_id.
 * Otherwise (no parent, or parent deleted) → return the video's own id.
 */
function getCanonicalId(videoId: number): number {
  const row = db
    .prepare('SELECT parent_id FROM videos WHERE id = ?')
    .get(videoId) as { parent_id: number | null } | undefined;

  if (!row?.parent_id) return videoId;

  const parentExists = db
    .prepare('SELECT id FROM videos WHERE id = ?')
    .get(row.parent_id) as { id: number } | undefined;

  if (!parentExists) return videoId;

  return row.parent_id;
}

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

      const canonicalId = getCanonicalId(videoId);

      const progress = db
        .prepare('SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?')
        .get(user.id, canonicalId) as VideoProgress | undefined;

      res.json({ progress: progress ?? null });
    } catch (error) {
      apiLogger.error({ err: error }, 'Get progress error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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

      // Ownership check uses the ORIGINAL video_id (user owns the child video)
      const videoExists = db
        .prepare('SELECT id FROM videos WHERE id = ? AND user_id = ?')
        .get(video_id, user.id);

      if (!videoExists) {
        res.json({ progress: { id: 0, user_id: user.id, video_id, position_seconds: Math.floor(position_seconds), updated_at: new Date().toISOString() } as VideoProgress });
        return;
      }

      const canonicalId = getCanonicalId(video_id);

      db.prepare(`
        INSERT INTO video_progress (user_id, video_id, position_seconds, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, video_id) DO UPDATE SET
          position_seconds = excluded.position_seconds,
          updated_at = CURRENT_TIMESTAMP
      `).run(user.id, canonicalId, Math.floor(position_seconds));

      const progress = db
        .prepare('SELECT * FROM video_progress WHERE user_id = ? AND video_id = ?')
        .get(user.id, canonicalId) as VideoProgress;

      res.json({ progress });
    } catch (error) {
      apiLogger.error({ err: error }, 'Save progress error');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
