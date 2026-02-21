import type { ParsedVideoUrl } from '../types/video.js';

// Parse YouTube URL to extract video ID
export function parseYouTubeUrl(url: string): ParsedVideoUrl | null {
  const patterns: RegExp[] = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return {
        platform: 'youtube',
        externalId: match[1],
        url: `https://youtube.com/watch?v=${match[1]}`
      };
    }
  }

  return null;
}

// Parse Rutube URL
export function parseRutubeUrl(url: string): ParsedVideoUrl | null {
  const patterns: RegExp[] = [
    /rutube\.ru\/video\/([a-f0-9]{32})/,
    /rutube\.ru\/play\/embed\/([a-f0-9]{32})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return {
        platform: 'rutube',
        externalId: match[1],
        url: `https://rutube.ru/video/${match[1]}/`
      };
    }
  }

  return null;
}

// Parse VK Video URL
export function parseVkVideoUrl(url: string): ParsedVideoUrl | null {
  // Patterns for VK video URLs
  const patterns: RegExp[] = [
    /vk\.com\/video(-?\d+)_(\d+)/,
    /vk\.com\/video_ext\.php\?oid=(-?\d+)&id=(\d+)/,
    /vkvideo\.ru\/video(-?\d+)_(\d+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && match?.[2]) {
      const ownerId = match[1];
      const videoId = match[2];

      return {
        platform: 'vk',
        externalId: `${ownerId}_${videoId}`,
        url: `https://vk.com/video${ownerId}_${videoId}`
      };
    }
  }

  return null;
}

// Main parser function
export function parseVideoUrl(url: string): ParsedVideoUrl | null {
  // Try YouTube
  const youtube = parseYouTubeUrl(url);
  if (youtube) {
    return youtube;
  }

  // Try Rutube
  const rutube = parseRutubeUrl(url);
  if (rutube) {
    return rutube;
  }

  // Try VK
  const vk = parseVkVideoUrl(url);
  if (vk) {
    return vk;
  }

  return null;
}

export default {
  parseYouTubeUrl,
  parseRutubeUrl,
  parseVkVideoUrl,
  parseVideoUrl
};
