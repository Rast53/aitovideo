import { Router, type Request, type Response } from 'express';
import { UserModel } from '../../models/user.js';
import type { ErrorResponse, MeResponse } from '../../types/api.js';

const router = Router();

// Get current user info
router.get('/', async (req: Request, res: Response<MeResponse | ErrorResponse>): Promise<void> => {
  try {
    const telegramId = req.telegramUser?.id;

    if (!telegramId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let user = UserModel.findByTelegramId(telegramId);

    // Create user if not exists
    if (!user) {
      user = UserModel.upsert({
        telegramId,
        username: req.telegramUser?.username,
        firstName: req.telegramUser?.first_name,
        lastName: req.telegramUser?.last_name
      });
    }

    res.json({
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
