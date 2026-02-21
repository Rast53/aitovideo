import type { TelegramUser } from './user.js';

declare module 'express-serve-static-core' {
  interface Request {
    telegramUser?: TelegramUser;
  }
}
