import type { VkVideoInfo } from '../types/video.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VkApiVideoItem {
  id: number;
  owner_id: number;
  title?: string;
  description?: string;
  duration?: number;
  image?: Array<{ url: string; width: number; height: number }>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'"
  };
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => entities[m] ?? m);
}

function bestThumbnail(item: VkApiVideoItem): string | null {
  if (Array.isArray(item.image) && item.image.length > 0) {
    const sorted = [...item.image].sort((a, b) => b.width - a.width);
    return sorted[0]?.url ?? null;
  }
  return item.photo_800 ?? item.photo_640 ?? item.photo_320 ?? null;
}

function extractOgMeta(html: string, property: 'og:title' | 'og:image'): string | null {
  return (
    html.match(new RegExp(`<meta\\s+property="${property}"\\s+content="([^"]+)"`))?.[1] ??
    html.match(new RegExp(`<meta\\s+content="([^"]+)"\\s+property="${property}"`))?.[1] ??
    null
  );
}

function extractTitle(html: string): string | null {
  const raw = extractOgMeta(html, 'og:title')?.trim();
  if (!raw) return null;

  const isGeneric =
    raw === 'VK' ||
    raw.toLowerCase().includes('vkontakte') ||
    raw.includes('ВКонтакте') ||
    raw.includes('Вконтакте') ||
    raw.startsWith('VK |') ||
    raw.startsWith('ВК |');

  return isGeneric ? null : decodeHtmlEntities(raw);
}

/** Read response as text, auto-detecting windows-1251 vs UTF-8 */
async function readHtml(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') ?? '';
  const ctCharset = contentType.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase();

  if (ctCharset && ctCharset !== 'utf-8' && ctCharset !== 'utf8') {
    const buf = await res.arrayBuffer();
    return new TextDecoder(ctCharset).decode(buf);
  }

  const text = await res.text();
  const metaCharset =
    text.match(/<meta[^>]+charset=["']?([^\s"';>]+)/i)?.[1]?.toLowerCase() ??
    text.match(/charset=([^\s"';>]+)/i)?.[1]?.toLowerCase();

  if (metaCharset && metaCharset !== 'utf-8' && metaCharset !== 'utf8') {
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    return new TextDecoder(metaCharset).decode(bytes);
  }

  return text;
}

const DESKTOP_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
};

// ─── Method 1: Official VK API (requires VK_SERVICE_TOKEN from a Standalone app)

async function tryVkApi(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) return null;

  const url =
    `https://api.vk.com/method/video.get` +
    `?videos=${encodeURIComponent(`${ownerId}_${videoId}`)}` +
    `&access_token=${token}` +
    `&v=5.199` +
    `&extended=0`;

  try {
    const res = await fetch(url, {
      headers: { ...DESKTOP_HEADERS, Accept: 'application/json' },
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

// ─── Method 2: Googlebot UA — VK serves full og-meta to crawlers ──────────────

async function tryGooglebotScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const html = await readHtml(res);
    const title = extractTitle(html);
    if (!title) return null;

    const thumbnailRaw = extractOgMeta(html, 'og:image');
    const thumbnailUrl = thumbnailRaw ? decodeHtmlEntities(thumbnailRaw) : null;

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

// ─── Method 3: Desktop UA — fallback ─────────────────────────────────────────

async function tryDesktopScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: { ...DESKTOP_HEADERS, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const html = await readHtml(res);
    const title = extractTitle(html);
    if (!title) return null;

    const thumbnailRaw = extractOgMeta(html, 'og:image');
    const thumbnailUrl = thumbnailRaw ? decodeHtmlEntities(thumbnailRaw) : null;

    return {
      title,
      channelName: 'VK Video',
      thumbnailUrl,
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

  const apiResult = await tryVkApi(ownerId, videoId);
  if (apiResult) {
    console.log(`[VK] ✓ API: "${apiResult.title}"`);
    return apiResult;
  }

  const googlebotResult = await tryGooglebotScraping(ownerId, videoId);
  if (googlebotResult) {
    console.log(`[VK] ✓ Googlebot: "${googlebotResult.title}"`);
    return googlebotResult;
  }

  const desktopResult = await tryDesktopScraping(ownerId, videoId);
  if (desktopResult) {
    console.log(`[VK] ✓ Desktop: "${desktopResult.title}"`);
    return desktopResult;
  }

  console.warn(`[VK] ✗ All methods failed for ${ownerId}_${videoId}`);
  return {
    title: 'VK Video',
    channelName: 'VK Video',
    thumbnailUrl: null,
    duration: null,
    embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
  };
}

export async function searchVkVideos(query: string, limit = 3): Promise<VkVideoInfo[]> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) {
    console.warn('[VK Search] No service token — skipping API search');
    return [];
  }

  const url =
    `https://api.vk.com/method/video.search` +
    `?q=${encodeURIComponent(query)}` +
    `&access_token=${token}` +
    `&v=5.199` +
    `&count=${limit}` +
    `&extended=0`;

  try {
    const res = await fetch(url, { headers: { ...DESKTOP_HEADERS, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as VkApiResponse;

    if (data.error || !data.response?.items) return [];

    return data.response.items.map(item => ({
      title: decodeHtmlEntities(item.title ?? 'VK Video'),
      channelName: 'VK Video',
      thumbnailUrl: bestThumbnail(item),
      duration: item.duration ?? null,
      embedUrl: `https://vk.com/video_ext.php?oid=${item.owner_id}&id=${item.id}&hd=2`,
      externalId: `${item.owner_id}_${item.id}`
    }));
  } catch (err) {
    console.warn('[VK Search] Search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function getVkEmbedUrl(ownerId: string, videoId: string): string {
  return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`;
}

export default { getVkVideoInfo, getVkEmbedUrl, searchVkVideos };
