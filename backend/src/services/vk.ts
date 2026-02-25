import type { VkVideoInfo } from '../types/video.js';

interface VkOembedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  type?: string;
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => entities[m] ?? m);
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
};

/**
 * Try VK oEmbed endpoint — official, no auth required, works for public videos.
 * Returns title, author_name, thumbnail_url.
 */
async function tryOembed(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;
  const oembedUrl = `https://vk.com/oembed.php?url=${encodeURIComponent(videoUrl)}&format=json`;

  try {
    const res = await fetch(oembedUrl, {
      headers: { ...BROWSER_HEADERS, Accept: 'application/json, text/plain, */*' },
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

/**
 * Fallback: parse Open Graph tags from VK video page HTML.
 */
async function tryHtmlScraping(ownerId: string, videoId: string): Promise<VkVideoInfo | null> {
  const videoUrl = `https://vk.com/video${ownerId}_${videoId}`;

  try {
    const res = await fetch(videoUrl, {
      headers: BROWSER_HEADERS,
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

export async function getVkVideoInfo(ownerId: string, videoId: string): Promise<VkVideoInfo> {
  // 1. Try official oEmbed API (best quality metadata)
  const oembedResult = await tryOembed(ownerId, videoId);
  if (oembedResult) {
    console.log(`[VK] oEmbed success: "${oembedResult.title}"`);
    return oembedResult;
  }

  // 2. Fallback: HTML scraping
  const htmlResult = await tryHtmlScraping(ownerId, videoId);
  if (htmlResult) {
    console.log(`[VK] HTML scraping success: "${htmlResult.title}"`);
    return htmlResult;
  }

  // 3. Could not fetch metadata — return stub
  console.warn(`[VK] Could not fetch metadata for ${ownerId}_${videoId}`);
  return {
    title: `VK Video ${ownerId}_${videoId}`,
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
