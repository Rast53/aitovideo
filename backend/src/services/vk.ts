import type { VkVideoInfo } from '../types/video.js';

// Get VK Video info (limited, using Open Graph parsing)
export async function getVkVideoInfo(ownerId: string, videoId: string): Promise<VkVideoInfo> {
  try {
    // Try to get Open Graph data
    const url = `https://vk.com/video${ownerId}_${videoId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`VK fetch failed: ${response.status}`);
    }

    const html = await response.text();

    // Parse Open Graph meta tags
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);

    return {
      title: titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : 'VK Video',
      channelName: 'VK Video',
      thumbnailUrl: imageMatch?.[1] ?? null,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  } catch (error) {
    console.error('VK Video info error:', error);
    // Return basic info
    return {
      title: 'VK Video',
      channelName: 'Unknown',
      thumbnailUrl: null,
      duration: null,
      embedUrl: `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`
    };
  }
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };

  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (match: string) => entities[match] ?? match);
}

// Get embed URL
export function getVkEmbedUrl(ownerId: string, videoId: string): string {
  return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=2`;
}

export default {
  getVkVideoInfo,
  getVkEmbedUrl
};
