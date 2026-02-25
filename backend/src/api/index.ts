import cors from 'cors';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { optionalTelegramAuth, telegramAuthMiddleware } from './middleware/auth.js';
import progressRouter from './routes/progress.js';
import proxyRouter from './routes/proxy.js';
import userRouter from './routes/user.js';
import videosRouter from './routes/videos.js';

dotenv.config();

const app = express();
const PORT: string | number = process.env.PORT ?? 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes (no auth required)
app.use('/api/proxy', proxyRouter);
app.use('/api/videos', optionalTelegramAuth, videosRouter);

// Protected routes (require Telegram auth)
app.use('/api/me', telegramAuthMiddleware, userRouter);
app.use('/api/videos/protected', telegramAuthMiddleware, videosRouter);
app.use('/api/progress', telegramAuthMiddleware, progressRouter);

// Error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : undefined
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

export default app;
