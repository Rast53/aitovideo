import { Router, type Request, type Response } from 'express';

const router = Router();

// Allowed CDN domains for thumbnail proxying (security whitelist)
const ALLOWED_HOSTS = [
  'sun1.userapi.com',
  'sun2.userapi.com',
  'sun3.userapi.com',
  'sun4.userapi.com',
  'sun5.userapi.com',
  'sun6.userapi.com',
  'sun7.userapi.com',
  'sun8.userapi.com',
  'sun9.userapi.com',
  'sun10.userapi.com',
  'sun11.userapi.com',
  'sun12.userapi.com',
  'userapi.com',
  'vk.com',
  'cs1.userapi.com',
  'cs2.userapi.com',
  'cs3.userapi.com',
  'cs4.userapi.com',
  'cs5.userapi.com',
  'cs6.userapi.com',
  'cs7.userapi.com',
  'cs9.userapi.com',
  'cs14.userapi.com',
];

// Simple in-memory cache: url → { buffer, contentType, expires }
interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  expires: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 500;

function isAllowedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/**
 * GET /api/proxy/thumbnail?url=<encoded_url>
 * Proxies a thumbnail image through the backend to bypass CDN restrictions.
 */
router.get('/thumbnail', async (req: Request, res: Response): Promise<void> => {
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

  if (!isAllowedUrl(targetUrl)) {
    res.status(403).json({ error: 'URL not allowed' });
    return;
  }

  // Check cache
  const cached = cache.get(targetUrl);
  if (cached && cached.expires > Date.now()) {
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'HIT');
    res.send(cached.buffer);
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        Referer: 'https://vk.com/'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      res.status(415).json({ error: 'Upstream did not return an image' });
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store in cache (evict oldest if full)
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    cache.set(targetUrl, { buffer, contentType, expires: Date.now() + CACHE_TTL_MS });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Cache', 'MISS');
    res.send(buffer);
  } catch (err) {
    console.error('[proxy/thumbnail] fetch error:', err);
    res.status(502).json({ error: 'Failed to fetch upstream image' });
  }
});

export default router;
