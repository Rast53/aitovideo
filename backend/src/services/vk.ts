import type { VkVideoInfo } from '../types/video.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VkApiVideoItem {
  id: number;
  owner_id: number;
  title?: string;
  description?: string;
  duration?: number;
  image?: Array<{ url: string; width: number; height: number }>;
  // Older API fields
  photo_800?: string;
  photo_640?: string;
  photo_320?: string;
}

interface VkApiResponse {
  response?: {
    count: number;
    items: VkApiVideoItem[];
  };
  error?: {
    error_code: number;
    error_msg: string;
  };
}

interface VkOembedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"
  };
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => entities[m] ?? m);
}

function bestThumbnail(item: VkApiVideoItem): string | null {
  // Prefer highest resolution from `image` array (v5.x+)
  if (Array.isArray(item.image) && item.image.length > 0) {
    const sorted = [...item.image].sort((a, b) => b.width - a.width);
    return sorted[0]?.url ?? null;
  }
  // Fallback to legacy fields
  return item.photo_800 ?? item.photo_640 ?? item.photo_320 ?? null;
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
};

// ─── Method 1: Official VK API (requires VK_SERVICE_TOKEN) ───────────────────

async function tryVkApi(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) return null;

  const videos = `${ownerId}_${videoId}`;
  const url =
    `https://api.vk.com/method/video.get` +
    `?videos=${encodeURIComponent(videos)}` +
    `&access_token=${token}` +
    `&v=5.199` +
    `&extended=0`;

  try {
    const res = await fetch(url, {
      headers: { ...FETCH_HEADERS, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      console.warn(`[VK API] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as VkApiResponse;

    if (data.error) {
      console.warn(`[VK API] Error ${data.error.error_code}: ${data.error.error_msg}`);
      return null;
    }

    const item = data.response?.items?.[0];
    if (!item?.title) return null;

    return {
      title: decodeHtmlEntities(item.title),
      channelName: 'VK Video',
      thumbnailUrl: bestThumbnail(item),
      duration: item.duration ?? null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch (err) {
    console.error('[VK API] fetch error:', err);
    return null;
  }
}

// ─── Method 2: VK oEmbed ─────────────────────────────────────────────────────

async function tryOembed(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;
  const oembedUrl = `https://vk.com/oembed.php?url=${encodeURIComponent(videoUrl)}&format=json`;

  try {
    const res = await fetch(oembedUrl, {
      headers: { ...FETCH_HEADERS, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    console.log(`[VK oEmbed] status=${res.status}`);
    if (!res.ok) return null;

    const data = (await res.json()) as VkOembedResponse;
    const title = data.title?.trim();
    if (!title) return null;

    return {
      title: decodeHtmlEntities(title),
      channelName: data.author_name ? decodeHtmlEntities(data.author_name) : 'VK Video',
      thumbnailUrl: data.thumbnail_url ?? null,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch (err) {
    console.warn('[VK oEmbed] error:', err);
    return null;
  }
}

// ─── Method 3: HTML scraping — mobile UA (sometimes bypasses bot detection) ──

async function tryMobileScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://m.vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    console.log(`[VK mobile] status=${res.status} url=${videoUrl}`);
    if (!res.ok) return null;

    const html = await readHtml(res);

    const titleMatch =
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ??
      html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/) ??
      html.match(/<title>([^<]+)<\/title>/);
    const imageMatch =
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/) ??
      html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/);

    const title = titleMatch?.[1]?.trim();
    console.log(`[VK mobile] raw title="${title ?? 'NOT FOUND'}"`);
    const isGeneric =
      !title ||
      title === 'VK' ||
      title.toLowerCase().includes('vkontakte') ||
      title.includes('ВКонтакте') ||
      title.includes('Вконтакте') ||
      title.startsWith('VK |') ||
      title.startsWith('ВК |');
    if (isGeneric) {
      console.log('[VK mobile] title is generic, skipping');
      return null;
    }

    return {
      title: decodeHtmlEntities(title),
      channelName: 'VK Video',
      thumbnailUrl: imageMatch?.[1] ? decodeHtmlEntities(imageMatch[1]) : null,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch (err) {
    console.warn('[VK mobile] error:', err);
    return null;
  }
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

/** Read response as text, auto-detecting windows-1251 vs UTF-8 from Content-Type / meta charset */
async function readHtml(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? '';
  // Detect charset from Content-Type header
  const ctCharset = contentType.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase();

  if (ctCharset && ctCharset !== 'utf-8' && ctCharset !== 'utf8') {
    // Non-UTF-8 — decode via ArrayBuffer
    const buf = await res.arrayBuffer();
    return new TextDecoder(ctCharset).decode(buf);
  }

  // Read as text first, then check meta charset fallback
  const text = await res.text();
  const metaCharset =
    text.match(/<meta[^>]+charset=["']?([^\s"';>]+)/i)?.[1]?.toLowerCase() ??
    text.match(/charset=([^\s"';>]+)/i)?.[1]?.toLowerCase();

  if (metaCharset && metaCharset !== 'utf-8' && metaCharset !== 'utf8') {
    // Re-decode: text() already decoded as UTF-8, we need raw bytes
    // Encode back to binary using latin1 (1:1 byte mapping) then decode with correct charset
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    return new TextDecoder(metaCharset).decode(bytes);
  }

  return text;
}

// ─── Method 4: HTML scraping — Googlebot UA (VK often serves full page to bots)

async function tryGooglebotScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    console.log(`[VK googlebot] status=${res.status}`);
    if (!res.ok) return null;

    const html = await readHtml(res);
    const title = extractOgTitle(html);
    if (!title) return null;

    const imageMatch =
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/) ??
      html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/);

    const thumbnailUrl = imageMatch?.[1] ? decodeHtmlEntities(imageMatch[1]) : null;
    console.log(`[VK googlebot] thumbnailUrl=${thumbnailUrl ?? 'NOT FOUND'}`);

    return {
      title,
      channelName: 'VK Video',
      thumbnailUrl,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch (err) {
    console.warn('[VK googlebot] error:', err);
    return null;
  }
}

function extractOgTitle(html: string): string | null {
  const raw =
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)?.[1] ??
    html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/)?.[1];

  const title = raw?.trim();
  if (!title) return null;

  const isGeneric =
    title === 'VK' ||
    title.toLowerCase().includes('vkontakte') ||
    title.includes('ВКонтакте') ||
    title.includes('Вконтакте') ||
    title.startsWith('VK |') ||
    title.startsWith('ВК |');

  return isGeneric ? null : decodeHtmlEntities(title);
}

// ─── Method 5: HTML scraping — desktop (last resort) ─────────────────────────

async function tryHtmlScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: { ...FETCH_HEADERS, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(10000)
    });

    console.log(`[VK desktop] status=${res.status}`);
    if (!res.ok) return null;

    const html = await readHtml(res);
    const title = extractOgTitle(html);
    if (!title) return null;

    const imageMatch =
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/) ??
      html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/);

    return {
      title,
      channelName: 'VK Video',
      thumbnailUrl: imageMatch?.[1] ? decodeHtmlEntities(imageMatch[1]) : null,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch (err) {
    console.warn('[VK desktop] error:', err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getVkVideoInfo(ownerId: string, videoId: string): Promise<VkVideoInfo> {
  console.log(`[VK] Fetching metadata for ${ownerId}_${videoId} ...`);

  // 1. Official VK API — точные данные, работает с любого IP
  const apiResult = await tryVkApi(ownerId, videoId);
  if (apiResult) {
    console.log(`[VK] ✓ API: "${apiResult.title}"`);
    return apiResult;
  }

  // 2. oEmbed
  const oembedResult = await tryOembed(ownerId, videoId);
  if (oembedResult) {
    console.log(`[VK] ✓ oEmbed: "${oembedResult.title}"`);
    return oembedResult;
  }

  // 3. Mobile HTML scraping
  const mobileResult = await tryMobileScraping(ownerId, videoId);
  if (mobileResult) {
    console.log(`[VK] ✓ Mobile scraping: "${mobileResult.title}"`);
    return mobileResult;
  }

  // 4. Googlebot scraping
  const googlebotResult = await tryGooglebotScraping(ownerId, videoId);
  if (googlebotResult) {
    console.log(`[VK] ✓ Googlebot scraping: "${googlebotResult.title}"`);
    return googlebotResult;
  }

  // 5. Desktop HTML scraping
  const htmlResult = await tryHtmlScraping(ownerId, videoId);
  if (htmlResult) {
    console.log(`[VK] ✓ Desktop scraping: "${htmlResult.title}"`);
    return htmlResult;
  }

  console.warn(
    `[VK] ✗ All methods failed for ${ownerId}_${videoId}.\n` +
    `  → API error 1051: токен VK ID не подходит, нужен классический.\n` +
    `  → Создайте Standalone-приложение на vk.com/editapp?act=create\n` +
    `  → Настройки → Сервисный ключ доступа → VK_SERVICE_TOKEN`
  );
  return {
    title: 'VK Video',
    channelName: 'VK Video',
    thumbnailUrl: null,
    duration: null,
    embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
  };
}

export function getVkEmbedUrl(ownerId: string, videoId: string): string {
  return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`;
}

export default { getVkVideoInfo, getVkEmbedUrl };
