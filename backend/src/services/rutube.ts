import type { RutubeVideoInfo } from '../types/video.js';

interface RutubeOEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  html?: string;
}

// Get Rutube video info via oEmbed
export async function getRutubeInfo(videoId: string): Promise<RutubeVideoInfo> {
  try {
    const url = `https://rutube.ru/api/oembed/?url=https://rutube.ru/video/${videoId}/&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Rutube oEmbed failed: ${response.status}`);
    }

    const data = (await response.json()) as RutubeOEmbedResponse;

    return {
      title: data.title ?? 'Rutube Video',
      channelName: data.author_name ?? 'Unknown',
      thumbnailUrl: data.thumbnail_url ?? null,
      duration: null, // oEmbed doesn't provide duration
      embedUrl: `https://rutube.ru/play/embed/${videoId}`,
      html: data.html
    };
  } catch (error) {
    console.error('Rutube info error:', error);
    // Return basic info if oEmbed fails
    return {
      title: 'Rutube Video',
      channelName: 'Unknown',
      thumbnailUrl: `https://rutube.ru/api/video/${videoId}/thumbnail/`,
      duration: null,
      embedUrl: `https://rutube.ru/play/embed/${videoId}`
    };
  }
}

// Get embed URL
export function getRutubeEmbedUrl(videoId: string): string {
  return `https://rutube.ru/play/embed/${videoId}`;
}

export default {
  getRutubeInfo,
  getRutubeEmbedUrl
};
