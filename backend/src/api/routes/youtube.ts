import { exec } from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { Router, type Request, type Response } from 'express';

const router = Router();
const execAsync = promisify(exec);

// ─── Stream URL cache ─────────────────────────────────────────────────────────
// YouTube CDN URLs expire in ~6 h; we cache for 1 h to be safe.

interface CachedUrl {
  url: string;
  expires: number;
}
const urlCache = new Map<string, CachedUrl>();
const CACHE_TTL_MS = 60 * 60 * 1000;

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Get a direct stream URL for a YouTube video via yt-dlp.
 * Format selector prefers the best progressive MP4 stream up to 1080p.
 * Progressive streams (like 22 for 720p or 18 for 360p) are audio+video combined,
 * requiring no ffmpeg muxing and allowing native browser playback.
 */
async function getStreamUrl(videoId: string): Promise<string> {
  const cacheKey = videoId;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  // Support outbound proxy for VPS in regions where YouTube is blocked.
  const proxyArg = process.env.YTDLP_PROXY ? `--proxy "${process.env.YTDLP_PROXY}"` : '';
  const formatSelector = '"best[height<=1080][ext=mp4][vcodec!=none][acodec!=none]/best[height<=1080][ext=mp4]/best[ext=mp4]/best"';

  const cmd = [
    'yt-dlp',
    '-f', formatSelector,
    '--no-playlist',
    proxyArg,
    '--get-url',
    `"https://www.youtube.com/watch?v=${videoId}"`
  ].filter(Boolean).join(' ');

  const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });

  if (stderr) console.warn(`[YouTube proxy] yt-dlp stderr: ${stderr.trim()}`);

  const url = stdout.trim().split('\n')[0]?.trim() ?? '';
  if (!url.startsWith('http')) {
    throw new Error(`yt-dlp did not return a valid URL for ${videoId}`);
  }

  urlCache.set(cacheKey, { url, expires: Date.now() + CACHE_TTL_MS });
  console.log(`[YouTube proxy] stream URL cached for ${videoId} (best quality)`);
  return url;
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
      console.warn(`[Thumbnail proxy] upstream status=${upstream.status} for ${videoId}`);
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
    console.error(`[Thumbnail proxy] error for ${videoId}:`, err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Thumbnail proxy error' });
    }
  }
});

/**
 * GET /api/youtube/stream/:videoId
 *
 * Proxies a YouTube video stream through the backend.
 * Supports HTTP Range requests so the client can seek.
 * No Telegram auth required — video ID is already public knowledge.
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

    console.log(
      `[YouTube proxy] request for ${videoId} range=${String(req.headers.range ?? 'none')}`
    );

    try {
      const streamUrl = await getStreamUrl(videoId);

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

      console.log(`[YouTube proxy] upstream status=${upstream.status} for ${videoId}`);

      // If the cached URL returned 403/410, evict cache and retry once
      if (upstream.status === 403 || upstream.status === 410) {
        urlCache.delete(videoId);
        res.status(502).json({ error: 'Stream URL expired, please retry' });
        return;
      }

      res.status(upstream.status);

      // Forward relevant response headers
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

      // Pipe the stream to the client
      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.pipe(res);

      req.on('close', () => nodeStream.destroy());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[YouTube proxy] error for ${videoId}:`, msg);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream unavailable', detail: msg });
      }
    }
  }
);

export default router;
