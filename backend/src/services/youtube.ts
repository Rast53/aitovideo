import type { YouTubeVideoInfo } from '../types/video.js';

interface InvidiousStream {
  url?: string;
  type?: string;
}

interface InvidiousThumbnail {
  url?: string;
}

interface InvidiousVideoData {
  title?: string;
  author?: string;
  lengthSeconds?: number;
  formatStreams?: InvidiousStream[];
  adaptiveFormats?: InvidiousStream[];
  videoThumbnails?: InvidiousThumbnail[];
}

// Invidious instances for YouTube bypass
const INVIDIOUS_INSTANCES: string[] = [
  'https://vid.puffyan.us',
  'https://y.com.sb',
  'https://iv.datura.network',
  'https://iv.nboeck.de',
  'https://iv.melmac.space'
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

// Fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Get video info from Invidious
export async function getYouTubeInfo(videoId: string): Promise<YouTubeVideoInfo> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const response = await fetchWithTimeout(`${instance}/api/v1/videos/${videoId}`, {}, 5000);

      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as InvidiousVideoData;

      // Find best quality stream
      const stream =
        data.formatStreams?.[0] ??
        data.adaptiveFormats?.find((format: InvidiousStream) =>
          format.type?.includes('video')
        );

      return {
        title: data.title ?? 'YouTube Video',
        channelName: data.author ?? 'Unknown',
        thumbnailUrl:
          data.videoThumbnails?.[0]?.url ?? `https://img.youtube.com/vi/${videoId}/0.jpg`,
        duration: data.lengthSeconds ?? null,
        streamUrl: stream?.url,
        instance
      };
    } catch (error) {
      console.log(`Instance ${instance} failed:`, getErrorMessage(error));
    }
  }

  throw new Error('No working Invidious instance found');
}

// Get embed URL (for iframe fallback)
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

// Get direct video URL (for custom player)
export async function getYouTubeStreamUrl(videoId: string): Promise<string | undefined> {
  const info = await getYouTubeInfo(videoId);
  return info.streamUrl;
}

export default {
  getYouTubeInfo,
  getYouTubeEmbedUrl,
  getYouTubeStreamUrl
};
