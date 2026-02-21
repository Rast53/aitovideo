import db from '../db.js';
import type { CreateVideoInput, Video, VideoPlatform } from '../types/video.js';

interface VideoIdRow {
  id: number;
}

export const VideoModel = {
  // Create a new video
  create({
    userId,
    platform,
    externalId,
    url,
    title,
    channelName = null,
    thumbnailUrl = null,
    duration = null
  }: CreateVideoInput): Video {
    const stmt = db.prepare(`
      INSERT INTO videos (user_id, platform, external_id, url, title, channel_name, thumbnail_url, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, platform, external_id) DO UPDATE SET
        title = excluded.title,
        channel_name = excluded.channel_name,
        thumbnail_url = excluded.thumbnail_url,
        duration = excluded.duration
      RETURNING *
    `);

    return stmt.get(
      userId,
      platform,
      externalId,
      url,
      title,
      channelName,
      thumbnailUrl,
      duration
    ) as Video;
  },

  // Get all videos for a user
  findByUserId(userId: number): Video[] {
    const stmt = db.prepare(`
      SELECT * FROM videos
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);

    return stmt.all(userId) as Video[];
  },

  // Get single video by ID
  findById(id: number): Video | undefined {
    const stmt = db.prepare('SELECT * FROM videos WHERE id = ?');
    return stmt.get(id) as Video | undefined;
  },

  // Delete video
  delete(id: number, userId: number): boolean {
    const stmt = db.prepare('DELETE FROM videos WHERE id = ? AND user_id = ?');
    const result = stmt.run(id, userId);
    return result.changes > 0;
  },

  // Mark as watched
  markAsWatched(id: number, userId: number, isWatched = true): Video | undefined {
    const stmt = db.prepare(`
      UPDATE videos
      SET is_watched = ?
      WHERE id = ? AND user_id = ?
      RETURNING *
    `);

    return stmt.get(isWatched ? 1 : 0, id, userId) as Video | undefined;
  },

  // Check if video exists
  exists(userId: number, platform: VideoPlatform, externalId: string): boolean {
    const stmt = db.prepare(`
      SELECT id FROM videos
      WHERE user_id = ? AND platform = ? AND external_id = ?
    `);

    return Boolean(stmt.get(userId, platform, externalId) as VideoIdRow | undefined);
  }
};

export default VideoModel;
