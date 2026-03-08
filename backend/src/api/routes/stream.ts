import { exec } from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { Router, type Request, type Response } from 'express';
import { apiLogger } from '../../logger.js';

const router = Router();
const execAsync = promisify(exec);

// ─── Stream URL cache (1 h TTL — CDN URLs expire after a few hours) ──────────

interface CachedStream {
  url: string;
  isHls: boolean;
  expires: number;
}

const urlCache = new Map<string, CachedStream>();
const CACHE_TTL_MS = 60 * 60 * 1000;

const PLATFORM_RE = /^(youtube|rutube|vk)$/;

// CDN hosts allowed for HLS proxy (prevents SSRF)
const ALLOWED_HLS_HOSTS = [
  'rutube.ru', 'strm.yandex.net', 'vh-cache.yandex.net',
  'vk.com', 'vk-cdn.net', 'userapi.com',
  'googlevideo.com', 'youtube.com', 'ytimg.com',
];

function isAllowedHlsUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HLS_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

function buildSourceUrl(platform: string, externalId: string): string {
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${externalId}`;
    case 'rutube':
      return `https://rutube.ru/video/${externalId}/`;
    case 'vk':
      return `https://vk.com/video${externalId}`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Resolve a direct or HLS stream URL via yt-dlp.
 * Prefers progressive MP4 for YouTube/VK; falls back to best for Rutube (often HLS).
 */
const VALID_QUALITIES = [360, 480, 720, 1080, 1440, 2160] as const;
type Quality = (typeof VALID_QUALITIES)[number];

function buildFormatSelector(platform: string, quality: Quality): string {
  if (platform === 'youtube') {
    // YouTube: progressive formats only (audio+video combined, no ffmpeg needed)
    // Max 720p — 1080p requires separate tracks which need muxing
    return `"best[height<=${quality}][ext=mp4][vcodec!=none][acodec!=none]/best[height<=${quality}][ext=mp4]/best[ext=mp4]/best"`;
  }
  // Rutube / VK: prefer quality-limited mp4, fallback to best
  return `"best[height<=${quality}][ext=mp4]/best[height<=${quality}]/best[ext=mp4]/best"`;
}

async function resolveStreamUrl(
  platform: string,
  externalId: string,
  quality: Quality = 1080
): Promise<{ url: string; isHls: boolean }> {
  const cacheKey = `${platform}:${externalId}:${quality}`;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { url: cached.url, isHls: cached.isHls };
  }

  const proxyArg = process.env.YTDLP_PROXY
    ? `--proxy "${process.env.YTDLP_PROXY}"`
    : '';
  const sourceUrl = buildSourceUrl(platform, externalId);

  const formatSelector = buildFormatSelector(platform, quality);

  const cmd = [
    'yt-dlp',
    '-f', formatSelector,
    '--no-playlist',
    proxyArg,
    '--get-url',
    `"${sourceUrl}"`,
  ]
    .filter(Boolean)
    .join(' ');

  const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });
  if (stderr) {
    apiLogger.warn(
      { platform, externalId, stderr: stderr.trim() },
      'yt-dlp stderr'
    );
  }

  const url = stdout.trim().split('\n')[0]?.trim() ?? '';
  if (!url.startsWith('http')) {
    throw new Error(
      `yt-dlp did not return a valid URL for ${platform}/${externalId}`
    );
  }

  const isHls = url.includes('.m3u8');
  urlCache.set(cacheKey, { url, expires: Date.now() + CACHE_TTL_MS, isHls });
  apiLogger.info({ platform, externalId, isHls }, 'Stream URL cached');
  return { url, isHls };
}

// ─── Rewrite URLs inside an HLS manifest to route through our proxy ──────────

function rewriteManifest(text: string, manifestUrl: string): string {
  const lines = text.split('\n');
  return lines
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
          const abs = new URL(uri, manifestUrl).href;
          return `URI="/api/stream/hls-proxy?url=${encodeURIComponent(abs)}"`;
        });
      }

      if (!trimmed) return line;

      const abs = new URL(trimmed, manifestUrl).href;
      return `/api/stream/hls-proxy?url=${encodeURIComponent(abs)}`;
    })
    .join('\n');
}

const STREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── GET /api/stream/:platform/:id/resolve ────────────────────────────────────
// Returns JSON: { streamUrl, type: 'mp4' | 'hls' }
// Optional query: ?quality=720 (YouTube only, default 1080)

router.get(
  '/:platform/:id/resolve',
  async (
    req: Request<{ platform: string; id: string }>,
    res: Response
  ): Promise<void> => {
    const { platform, id } = req.params;
    if (!PLATFORM_RE.test(platform)) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    const requestedQuality = parseInt(String(req.query.quality ?? '1080'), 10);
    const quality: Quality = (VALID_QUALITIES.includes(requestedQuality as Quality)
      ? requestedQuality
      : 1080) as Quality;

    try {
      const { isHls } = await resolveStreamUrl(platform, id, quality);

      if (isHls) {
        const { url: hlsUrl } = await resolveStreamUrl(platform, id, quality);
        res.json({
          streamUrl: `/api/stream/hls-proxy?url=${encodeURIComponent(hlsUrl)}`,
          type: 'hls',
        });
      } else {
        const qualityParam = platform === 'youtube' ? `?quality=${quality}` : '';
        res.json({
          streamUrl: `/api/stream/${platform}/${id}/proxy${qualityParam}`,
          type: 'mp4',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      apiLogger.error({ platform, id, err: msg }, 'Stream resolve error');
      res.status(502).json({ error: 'Cannot resolve stream', detail: msg });
    }
  }
);

// ─── GET /api/stream/:platform/:id/proxy ──────────────────────────────────────
// Proxies a direct (non-HLS) stream. Supports Range headers for seeking.

router.get(
  '/:platform/:id/proxy',
  async (
    req: Request<{ platform: string; id: string }>,
    res: Response
  ): Promise<void> => {
    const { platform, id } = req.params;
    if (!PLATFORM_RE.test(platform)) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    apiLogger.info(
      { platform, id, range: req.headers.range ?? 'none' },
      'Stream proxy request'
    );

    const requestedQualityProxy = parseInt(String(req.query.quality ?? '1080'), 10);
    const qualityProxy: Quality = (VALID_QUALITIES.includes(requestedQualityProxy as Quality)
      ? requestedQualityProxy
      : 1080) as Quality;

    try {
      const { url: streamUrl, isHls } = await resolveStreamUrl(platform, id, qualityProxy);
      if (isHls) {
        res.status(400).json({ error: 'Use HLS proxy for this stream' });
        return;
      }

      const upstreamHeaders: Record<string, string> = {
        'User-Agent': STREAM_UA,
        Accept: '*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        Referer:
          platform === 'youtube'
            ? 'https://www.youtube.com/'
            : platform === 'rutube'
              ? 'https://rutube.ru/'
              : 'https://vk.com/',
      };

      if (req.headers.range) {
        upstreamHeaders['Range'] = String(req.headers.range);
      }

      const upstream = await fetch(streamUrl, {
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(30_000),
      });

      if (upstream.status === 403 || upstream.status === 410) {
        urlCache.delete(`${platform}:${id}:${qualityProxy}`);
        res.status(502).json({ error: 'Stream URL expired, please retry' });
        return;
      }

      res.status(upstream.status);

      for (const header of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag',
      ]) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      res.setHeader('Cache-Control', 'no-store');

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as Parameters<typeof Readable.fromWeb>[0]
      );
      nodeStream.pipe(res);
      req.on('close', () => nodeStream.destroy());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      apiLogger.error({ platform, id, err: msg }, 'Stream proxy error');
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream unavailable', detail: msg });
      }
    }
  }
);

// ─── GET /api/stream/hls-proxy?url=<encoded> ─────────────────────────────────
// Proxies HLS manifests (with URL rewriting) and media segments.

router.get('/hls-proxy', async (req: Request, res: Response): Promise<void> => {
  const rawUrl = req.query.url as string | undefined;
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid url encoding' });
    return;
  }

  if (!isAllowedHlsUrl(targetUrl)) {
    apiLogger.warn({ targetUrl }, 'HLS proxy: blocked URL');
    res.status(403).json({ error: 'URL not allowed' });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': STREAM_UA,
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      res
        .status(upstream.status)
        .json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const isManifest =
      targetUrl.includes('.m3u8') || contentType.includes('mpegurl');

    if (isManifest) {
      const text = await upstream.text();
      const rewritten = rewriteManifest(text, targetUrl);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(rewritten);
    } else {
      res.status(upstream.status);
      for (const header of ['content-type', 'content-length']) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as Parameters<typeof Readable.fromWeb>[0]
      );
      nodeStream.pipe(res);
      req.on('close', () => nodeStream.destroy());
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    apiLogger.error({ targetUrl, err: msg }, 'HLS proxy error');
    if (!res.headersSent) {
      res.status(502).json({ error: 'HLS proxy failed' });
    }
  }
});

export default router;
