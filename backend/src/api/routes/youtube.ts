import { exec } from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { Router, type Request, type Response } from 'express';
import { apiLogger } from '../../logger.js';

const router = Router();
const execAsync = promisify(exec);

// ─── Stream URL cache ─────────────────────────────────────────────────────────
// YouTube CDN URLs expire in ~6 h; we cache for 1 h to be safe.

interface CachedUrl {
  url: string;
  expires: number;
}
const urlCache = new Map<string, CachedUrl>();

interface CachedInfo {
  availableQualities: number[];
  expires: number;
}
const infoCache = new Map<string, CachedInfo>();

const CACHE_TTL_MS = 60 * 60 * 1000;

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const VALID_QUALITIES = [360, 480, 720, 1080, 1440, 2160] as const;

function parseQuality(raw: unknown): number {
  const n = parseInt(String(raw), 10);
  if (VALID_QUALITIES.includes(n as typeof VALID_QUALITIES[number])) return n;
  return 1080;
}

function buildFormatSelector(quality: number): string {
  return `"best[height<=${quality}][ext=mp4][vcodec!=none][acodec!=none]/best[height<=${quality}][ext=mp4]/best[ext=mp4]/best"`;
}

/**
 * Get a direct stream URL for a YouTube video via yt-dlp.
 * Progressive streams (audio+video combined) allow native browser playback.
 */
async function getStreamUrl(videoId: string, quality: number = 1080): Promise<string> {
  const cacheKey = `${videoId}:${quality}`;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  const proxyArg = process.env.YTDLP_PROXY ? `--proxy "${process.env.YTDLP_PROXY}"` : '';
  const formatSelector = buildFormatSelector(quality);

  const cmd = [
    'yt-dlp',
    '-f', formatSelector,
    '--no-playlist',
    proxyArg,
    '--get-url',
    `"https://www.youtube.com/watch?v=${videoId}"`
  ].filter(Boolean).join(' ');

  const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });

  if (stderr) apiLogger.warn({ videoId, stderr: stderr.trim() }, 'yt-dlp stderr');

  const url = stdout.trim().split('\n')[0]?.trim() ?? '';
  if (!url.startsWith('http')) {
    throw new Error(`yt-dlp did not return a valid URL for ${videoId}`);
  }

  urlCache.set(cacheKey, { url, expires: Date.now() + CACHE_TTL_MS });
  apiLogger.info({ videoId, quality }, 'Stream URL cached');
  return url;
}

/**
 * Query yt-dlp for available video heights (qualities) for a given video.
 */
async function getAvailableQualities(videoId: string): Promise<number[]> {
  const cached = infoCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return cached.availableQualities;
  }

  const proxyArg = process.env.YTDLP_PROXY ? `--proxy "${process.env.YTDLP_PROXY}"` : '';

  const cmd = [
    'yt-dlp',
    '--list-formats',
    '--no-playlist',
    proxyArg,
    `"https://www.youtube.com/watch?v=${videoId}"`
  ].filter(Boolean).join(' ');

  const { stdout } = await execAsync(cmd, { timeout: 30_000 });

  const heightSet = new Set<number>();
  for (const line of stdout.split('\n')) {
    // yt-dlp format lines contain resolution like "1920x1080" or "1280x720"
    const match = /(\d{3,5})x(\d{3,5})/.exec(line);
    if (match) {
      const h = parseInt(match[2], 10);
      if (VALID_QUALITIES.includes(h as typeof VALID_QUALITIES[number])) {
        heightSet.add(h);
      }
    }
  }

  const availableQualities = [...heightSet].sort((a, b) => a - b);

  if (availableQualities.length === 0) {
    availableQualities.push(1080);
  }

  infoCache.set(videoId, { availableQualities, expires: Date.now() + CACHE_TTL_MS });
  return availableQualities;
}

/**
 * GET /api/youtube/thumbnail/:videoId
 *
 * Proxies a YouTube thumbnail (hqdefault.jpg) through the backend
 * to bypass regional blocks on i.ytimg.com (e.g., in Russia).
 */
router.get('/thumbnail/:videoId', async (req: Request<{ videoId: string }>, res: Response): Promise<void> => {
  const videoId = String(req.params.videoId ?? '');

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    res.status(400).json({ error: 'Invalid YouTube video ID' });
    return;
  }

  const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  
  try {
    const upstream = await fetch(thumbUrl, {
      signal: AbortSignal.timeout(10000)
    });

    if (!upstream.ok) {
      apiLogger.warn({ videoId, status: upstream.status }, 'Thumbnail upstream error');
      res.status(upstream.status).json({ error: 'Thumbnail unavailable' });
      return;
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24h

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(res);
  } catch (err) {
    apiLogger.error({ err, videoId }, 'Thumbnail proxy error');
    if (!res.headersSent) {
      res.status(502).json({ error: 'Thumbnail proxy error' });
    }
  }
});

/**
 * GET /api/youtube/info/:videoId?quality=720
 *
 * Returns available qualities and the actual quality that would be served.
 */
router.get('/info/:videoId', async (req: Request<{ videoId: string }>, res: Response): Promise<void> => {
  const videoId = String(req.params.videoId ?? '');

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    res.status(400).json({ error: 'Invalid YouTube video ID' });
    return;
  }

  const requestedQuality = parseQuality(req.query.quality);

  try {
    const availableQualities = await getAvailableQualities(videoId);

    // Pick the best available quality that is <= requested
    const actualQuality = availableQualities.filter(q => q <= requestedQuality).pop()
      ?? availableQualities[0]
      ?? requestedQuality;

    res.json({ availableQualities, requestedQuality, actualQuality });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    apiLogger.error({ err: msg, videoId }, 'Failed to get video info');
    res.status(502).json({ error: 'Failed to get video info', detail: msg });
  }
});

/**
 * GET /api/youtube/stream/:videoId?quality=720
 *
 * Proxies a YouTube video stream through the backend.
 * Supports HTTP Range requests so the client can seek.
 */
router.get(
  '/stream/:videoId',
  async (
    req: Request<{ videoId: string }>,
    res: Response
  ): Promise<void> => {
    const videoId = String(req.params.videoId ?? '');

    if (!videoId || !VIDEO_ID_RE.test(videoId)) {
      res.status(400).json({ error: 'Invalid YouTube video ID' });
      return;
    }

    const quality = parseQuality(req.query.quality);

    apiLogger.debug({ videoId, quality, range: req.headers.range ?? 'none' }, 'Stream request');

    try {
      const streamUrl = await getStreamUrl(videoId, quality);

      const upstreamHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        'Referer': 'https://www.youtube.com/'
      };

      if (req.headers.range) {
        upstreamHeaders['Range'] = String(req.headers.range);
      }

      const upstream = await fetch(streamUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(30_000)
      });

      apiLogger.debug({ videoId, quality, upstreamStatus: upstream.status }, 'Upstream response');

      if (upstream.status === 403 || upstream.status === 410) {
        urlCache.delete(`${videoId}:${quality}`);
        res.status(502).json({ error: 'Stream URL expired, please retry' });
        return;
      }

      res.status(upstream.status);

      for (const header of [
        'content-type', 'content-length', 'content-range',
        'accept-ranges', 'last-modified', 'etag'
      ]) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      res.setHeader('Cache-Control', 'no-store');

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.pipe(res);

      req.on('close', () => nodeStream.destroy());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      apiLogger.error({ err: msg, videoId, quality }, 'Stream error');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream unavailable', detail: msg });
      }
    }
  }
);

export default router;
