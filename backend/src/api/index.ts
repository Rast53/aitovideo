import cors from 'cors';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { apiLogger } from '../logger.js';
import { optionalTelegramAuth, telegramAuthMiddleware } from './middleware/auth.js';
import progressRouter from './routes/progress.js';
import proxyRouter from './routes/proxy.js';
import userRouter from './routes/user.js';
import videosRouter from './routes/videos.js';
import youtubeRouter from './routes/youtube.js';

dotenv.config();

const app = express();
const PORT: string | number = process.env.PORT ?? 3000;

// Middleware
app.use(cors());
app.use(express.json());

// HTTP request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    apiLogger[level]({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration_ms: duration,
      user_id: (req as Request & { userId?: number }).userId,
    }, `${req.method} ${req.url} ${res.statusCode}`);
  });
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes (no auth required)
app.use('/api/proxy', proxyRouter);
app.use('/api/youtube', youtubeRouter);
app.use('/api/videos', optionalTelegramAuth, videosRouter);

// Protected routes (require Telegram auth)
app.use('/api/me', telegramAuthMiddleware, userRouter);
app.use('/api/videos/protected', telegramAuthMiddleware, videosRouter);
app.use('/api/progress', telegramAuthMiddleware, progressRouter);

// Error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  apiLogger.error({
    err,
    method: req.method,
    url: req.url,
  }, 'Unhandled API error');
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : undefined
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  apiLogger.warn({ method: req.method, url: req.url }, '404 Not found');
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  apiLogger.info({ port: PORT, env: process.env.NODE_ENV ?? 'development' }, 'API server started');
});

export default app;
