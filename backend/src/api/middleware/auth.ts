import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { TelegramAuthResult } from '../../types/api.js';
import type { TelegramUser } from '../../types/user.js';

const BOT_TOKEN_VALUE = process.env.BOT_TOKEN;

if (!BOT_TOKEN_VALUE) {
  console.error('BOT_TOKEN is not set!');
  process.exit(1);
}

const BOT_TOKEN: string = BOT_TOKEN_VALUE;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function parseTelegramUser(userJson: string | null): TelegramUser | null {
  if (!userJson) {
    return null;
  }

  const parsed = JSON.parse(userJson) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Partial<TelegramUser>;
  if (typeof candidate.id !== 'number') {
    return null;
  }

  return {
    id: candidate.id,
    username: typeof candidate.username === 'string' ? candidate.username : undefined,
    first_name: typeof candidate.first_name === 'string' ? candidate.first_name : undefined,
    last_name: typeof candidate.last_name === 'string' ? candidate.last_name : undefined
  };
}

// Verify Telegram WebApp initData
export function verifyTelegramWebAppData(initData: string): TelegramAuthResult {
  try {
    // Parse initData string
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false, error: 'No hash in initData' };
    }

    params.delete('hash');

    // Sort params alphabetically
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Create secret key from bot token
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Invalid hash' };
    }

    // Parse user data
    const user = parseTelegramUser(params.get('user'));

    return { valid: true, user };
  } catch (error) {
    return { valid: false, error: getErrorMessage(error) };
  }
}

function getInitDataHeader(req: Request): string | undefined {
  const raw = req.headers['x-telegram-init-data'];
  if (typeof raw === 'string') {
    return raw;
  }

  if (Array.isArray(raw) && raw[0]) {
    return raw[0];
  }

  return undefined;
}

// Express middleware
export function telegramAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const initData = getInitDataHeader(req);

  if (!initData) {
    res.status(401).json({ error: 'Missing initData' });
    return;
  }

  const result = verifyTelegramWebAppData(initData);

  if (!result.valid) {
    res.status(401).json({ error: 'Invalid initData', message: result.error });
    return;
  }

  req.telegramUser = result.user ?? undefined;
  next();
}

// Optional auth (for bot webhook)
export function optionalTelegramAuth(req: Request, _res: Response, next: NextFunction): void {
  const initData = getInitDataHeader(req);

  if (initData) {
    const result = verifyTelegramWebAppData(initData);
    if (result.valid && result.user) {
      req.telegramUser = result.user;
    }
  }

  next();
}

export default {
  verifyTelegramWebAppData,
  telegramAuthMiddleware,
  optionalTelegramAuth
};
