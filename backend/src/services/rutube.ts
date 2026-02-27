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

interface RutubeSearchItem {
  id: string;
  title: string;
  author: { name: string };
  thumbnail_url: string;
  duration: number;
}

interface RutubeSearchResponse {
  results: RutubeSearchItem[];
}

// Search Rutube videos by query
export async function searchRutubeVideos(query: string, limit = 3): Promise<RutubeVideoInfo[]> {
  try {
    // Attempt 1: Search API (fast, but often hits irrelevant results for complex queries)
    const searchUrl = `https://rutube.ru/api/search/video/?query=${encodeURIComponent(query)}&is_official=false`;
    const response = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });

    if (response.ok) {
      const data = (await response.json()) as RutubeSearchResponse;
      if (data.results && data.results.length > 0) {
        // Simple heuristic: if query words are in the title, it's likely a match
        const queryWords = query.toLowerCase().replace(/[^a-zа-я0-9]/g, ' ').split(/\s+/).filter(w => w.length > 3);
        const matches = data.results.filter(item => {
          const title = item.title.toLowerCase();
          return queryWords.every(word => title.includes(word));
        });

        if (matches.length > 0) {
          return matches.slice(0, limit).map(item => ({
            title: item.title,
            channelName: item.author?.name || 'Rutube',
            thumbnailUrl: item.thumbnail_url,
            duration: item.duration,
            embedUrl: `https://rutube.ru/play/embed/${item.id}`,
            externalId: item.id
          }));
        }
      }
    }
    
    // Attempt 2: Direct Search Page (can be blocked, requires UA)
    const browserSearchUrl = `https://rutube.ru/search/?query=${encodeURIComponent(query)}`;
    const pageResponse = await fetch(browserSearchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (pageResponse.ok) {
      const html = await pageResponse.text();
      // Look for /video/ID/ patterns
      const videoMatches = [...html.matchAll(/\/video\/([a-f0-9]{32})\//g)];
      const ids = [...new Set(videoMatches.map(m => m[1]))].slice(0, limit);
      
      if (ids.length > 0) {
        const results = await Promise.all(ids.map(id => getRutubeInfo(id).catch(() => null)));
        return results.filter((r): r is RutubeVideoInfo => r !== null).map(r => ({
          ...r,
          externalId: r.embedUrl.split('/').pop() || ''
        }));
      }
    }

    return [];
  } catch (error) {
    console.warn('[Rutube Search] Error:', error);
    return [];
  }
}

// Get embed URL
export function getRutubeEmbedUrl(videoId: string): string {
  return `https://rutube.ru/play/embed/${videoId}`;
}

export default {
  getRutubeInfo,
  getRutubeEmbedUrl,
  searchRutubeVideos
};
