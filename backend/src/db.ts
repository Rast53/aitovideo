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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, platform, external_id)
    )
  `);

  // Indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at)');
}

initTables();

export default db;
