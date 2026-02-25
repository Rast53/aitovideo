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

// ─── Method 2: VK oEmbed (works only if VPS IP is not blocked by VK) ─────────

async function tryOembed(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;
  const oembedUrl = `https://vk.com/oembed.php?url=${encodeURIComponent(videoUrl)}&format=json`;

  try {
    const res = await fetch(oembedUrl, {
      headers: { ...FETCH_HEADERS, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

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
  } catch {
    return null;
  }
}

// ─── Method 3: HTML Open Graph scraping (last resort) ────────────────────────

async function tryHtmlScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: { ...FETCH_HEADERS, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) return null;

    const html = await res.text();

    const titleMatch =
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/) ??
      html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/);
    const imageMatch =
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/) ??
      html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/);

    const title = titleMatch?.[1]?.trim();
    if (!title) return null;

    return {
      title: decodeHtmlEntities(title),
      channelName: 'VK Video',
      thumbnailUrl: imageMatch?.[1] ?? null,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getVkVideoInfo(ownerId: string, videoId: string): Promise<VkVideoInfo> {
  // 1. Official VK API (best: title + duration + thumbnails)
  const apiResult = await tryVkApi(ownerId, videoId);
  if (apiResult) {
    console.log(`[VK] API success: "${apiResult.title}"`);
    return apiResult;
  }

  // 2. oEmbed (works when VPS IP is not blocked)
  const oembedResult = await tryOembed(ownerId, videoId);
  if (oembedResult) {
    console.log(`[VK] oEmbed success: "${oembedResult.title}"`);
    return oembedResult;
  }

  // 3. HTML scraping (last resort)
  const htmlResult = await tryHtmlScraping(ownerId, videoId);
  if (htmlResult) {
    console.log(`[VK] HTML scraping success: "${htmlResult.title}"`);
    return htmlResult;
  }

  console.warn(`[VK] All methods failed for ${ownerId}_${videoId}. Set VK_SERVICE_TOKEN env var.`);
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
