import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH: string = process.env.DATABASE_URL ?? './data/videos.db';

// Ensure directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

// Create database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
// Enable foreign key enforcement (SQLite disables it by default per connection)
db.pragma('foreign_keys = ON');

// Initialize tables
function initTables(): void {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Videos table
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_name TEXT,
      thumbnail_url TEXT,
      duration INTEGER,
      is_watched BOOLEAN DEFAULT FALSE,
      parent_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES videos(id) ON DELETE SET NULL,
      UNIQUE(user_id, platform, external_id)
    )
  `);

  // Video progress table
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      position_seconds INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      UNIQUE(user_id, video_id)
    )
  `);

  // Indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_progress_user_video ON video_progress(user_id, video_id)');
}

/** Additive migrations for existing databases (ALTER TABLE for new columns) */
function runMigrations(): void {
  const existingCols = (db.pragma('table_info(videos)') as Array<{ name: string }>).map((c) => c.name);

  if (!existingCols.includes('parent_id')) {
    db.exec(
      'ALTER TABLE videos ADD COLUMN parent_id INTEGER REFERENCES videos(id) ON DELETE SET NULL'
    );
    console.log('[db] Migration: added parent_id column to videos');
  }
}

/** One-time fix: replace HTML-encoded & (&amp;) in thumbnail URLs saved before entity decoding was applied */
function fixAmpersandsInThumbnails(): void {
  const result = db
    .prepare(
      `UPDATE videos
       SET thumbnail_url = REPLACE(thumbnail_url, '&amp;', '&')
       WHERE thumbnail_url LIKE '%&amp;%'`
    )
    .run();

  if (result.changes > 0) {
    console.log(`[db] Fixed &amp; in thumbnail_url for ${result.changes} row(s)`);
  }
}

initTables();
runMigrations();
fixAmpersandsInThumbnails();

export default db;
