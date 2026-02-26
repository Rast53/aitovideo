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
const SUPPORTED_QUALITIES = ['360', '720', '1080'] as const;
type YoutubeQuality = (typeof SUPPORTED_QUALITIES)[number];
const DEFAULT_QUALITY: YoutubeQuality = '720';
const QUALITY_FORMAT_SELECTOR: Record<YoutubeQuality, string> = {
  '360': '"18/best[height<=360]"',
  '720': '"22/best[height<=720]"',
  '1080': '"22/best[height<=1080]"' 
};

function isYoutubeQuality(value: string): value is YoutubeQuality {
  return (SUPPORTED_QUALITIES as readonly string[]).includes(value);
}

function parseQuality(value: unknown): YoutubeQuality {
  if (typeof value !== 'string') return DEFAULT_QUALITY;
  return isYoutubeQuality(value) ? value : DEFAULT_QUALITY;
}

/**
 * Get a direct stream URL for a YouTube video via yt-dlp.
 * Formats 22 (720p MP4) and 18 (360p MP4) are combined audio+video —
 * no ffmpeg muxing required, supported by all browsers natively.
 */
async function getStreamUrl(videoId: string, quality: YoutubeQuality): Promise<string> {
  const cacheKey = `${videoId}:${quality}`;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  // Support outbound proxy for VPS in regions where YouTube is blocked.
  // Set YTDLP_PROXY=socks5://host:port or http://host:port in environment.
  const proxyArg = process.env.YTDLP_PROXY ? `--proxy "${process.env.YTDLP_PROXY}"` : '';
  const formatSelector = QUALITY_FORMAT_SELECTOR[quality];

  // Prefer a single progressive stream URL for each quality tier.
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

  const streamUrls = stdout.trim().split('\n').map((line) => line.trim()).filter(Boolean);
  if (streamUrls.length > 1) {
    console.warn(
      `[YouTube proxy] quality=${quality} returned multiple stream URLs (${streamUrls.length}); using first URL`
    );
  }

  const url = streamUrls[0] ?? '';
  if (!url.startsWith('http')) {
    throw new Error(`yt-dlp did not return a valid URL for ${videoId} (quality=${quality})`);
  }

  urlCache.set(cacheKey, { url, expires: Date.now() + CACHE_TTL_MS });
  console.log(`[YouTube proxy] stream URL cached for ${videoId} quality=${quality}`);
  return url;
}

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
    req: Request<{ videoId: string }, unknown, unknown, { quality?: string }>,
    res: Response
  ): Promise<void> => {
    const videoId = String(req.params.videoId ?? '');
    const quality = parseQuality(req.query.quality);

    if (!videoId || !VIDEO_ID_RE.test(videoId)) {
      res.status(400).json({ error: 'Invalid YouTube video ID' });
      return;
    }

    console.log(
      `[YouTube proxy] request for ${videoId} quality=${quality} range=${String(req.headers.range ?? 'none')}`
    );

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

      console.log(`[YouTube proxy] upstream status=${upstream.status} for ${videoId} quality=${quality}`);

      // If the cached URL returned 403/410, evict cache and retry once
      if (upstream.status === 403 || upstream.status === 410) {
        urlCache.delete(`${videoId}:${quality}`);
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
      console.error(`[YouTube proxy] error for ${videoId} quality=${quality}:`, msg);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream unavailable', detail: msg });
      }
    }
  }
);

export default router;
