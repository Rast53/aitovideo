import type { YouTubeVideoInfo } from '../types/video.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OembedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface InvidiousVideoData {
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Standard YouTube thumbnail URL — img.youtube.com is always reachable. */
function thumbnailUrl(videoId: string): string {
  // maxresdefault (1280×720) exists for most modern videos;
  // hqdefault (480×360) is the guaranteed fallback.
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// ─── Method 1: YouTube oEmbed (official, no API key) ─────────────────────────

async function tryOembed(videoId: string): Promise<YouTubeVideoInfo | null> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      console.warn(`[YouTube oEmbed] HTTP ${res.status} for ${videoId}`);
      return null;
    }

    const data = (await res.json()) as OembedResponse;
    const title = data.title?.trim();
    if (!title) return null;

    return {
      title,
      channelName: data.author_name?.trim() ?? 'YouTube',
      thumbnailUrl: thumbnailUrl(videoId),
      duration: null,
      instance: 'oembed'
    };
  } catch (err) {
    console.warn(`[YouTube oEmbed] error for ${videoId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Method 2: Invidious (optional, for duration) ────────────────────────────
// Invidious instances go down often — used only as a bonus source of duration data.

const INVIDIOUS_INSTANCES = [
  'https://invidious.privacydev.net',
  'https://yt.cdaut.de',
  'https://invidious.nerdvpn.de',
  'https://iv.ergy.fr',
  'https://invidious.fdn.fr'
];

async function tryInvidiousDuration(videoId: string): Promise<number | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) continue;

      const data = (await res.json()) as InvidiousVideoData;
      if (typeof data.lengthSeconds === 'number' && data.lengthSeconds > 0) {
        return data.lengthSeconds;
      }
    } catch {
      // Instance unavailable — try next
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getYouTubeInfo(videoId: string): Promise<YouTubeVideoInfo> {
  // oEmbed is the primary (and reliable) source
  const oembedResult = await tryOembed(videoId);

  if (oembedResult) {
    // Try to enrich with duration from Invidious (fire-and-forget, non-blocking)
    const duration = await tryInvidiousDuration(videoId);
    return { ...oembedResult, duration };
  }

  // Hard fallback — at least embed URL and thumbnail will work
  console.warn(`[YouTube] oEmbed failed for ${videoId}, using generic fallback`);
  return {
    title: 'YouTube Video',
    channelName: 'YouTube',
    thumbnailUrl: thumbnailUrl(videoId),
    duration: null,
    instance: 'fallback'
  };
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export default { getYouTubeInfo, getYouTubeEmbedUrl };
