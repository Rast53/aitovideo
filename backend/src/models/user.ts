import db from '../db.js';
import type { UpsertUserInput, User } from '../types/user.js';

export const UserModel = {
  // Create or update user
  upsert({ telegramId, username = null, firstName = null, lastName = null }: UpsertUserInput): User {
    const stmt = db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name
      RETURNING *
    `);

    return stmt.get(telegramId, username, firstName, lastName) as User;
  },

  // Get user by Telegram ID
  findByTelegramId(telegramId: number): User | undefined {
    const stmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
    return stmt.get(telegramId) as User | undefined;
  },

  // Get user by internal ID
  findById(id: number): User | undefined {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | undefined;
  }
};

export default UserModel;
