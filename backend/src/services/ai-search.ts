import { parseVkVideoUrl, parseRutubeUrl } from './parser.js';
import { getVkVideoInfo } from './vk.js';
import { getRutubeInfo } from './rutube.js';
import { serviceLogger } from '../logger.js';
import type { BaseVideoInfo, VideoPlatform } from '../types/video.js';

export interface AltCandidate extends BaseVideoInfo {
  platform: VideoPlatform;
  externalId: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'perplexity/sonar';

export async function searchAlternatives(
  title: string,
  channel: string
): Promise<AltCandidate[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    serviceLogger.warn('OPENROUTER_API_KEY is not set — skipping AI alt search');
    return [];
  }

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a video search assistant. Find video URLs on VK and Rutube. Return ONLY direct video URLs, one per line, no other text.',
          },
          {
            role: 'user',
            content: `Find this video on vk.com and rutube.ru: "${title}" by ${channel}. Return direct video URLs only, one per line.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      serviceLogger.warn(
        { status: res.status, statusText: res.statusText },
        'OpenRouter API returned non-OK status'
      );
      return [];
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      serviceLogger.warn('OpenRouter response has no content');
      return [];
    }

    serviceLogger.info({ content }, 'OpenRouter raw response');

    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('http'));

    const candidates: AltCandidate[] = [];

    for (const line of lines) {
      try {
        const vkParsed = parseVkVideoUrl(line);
        if (vkParsed) {
          const [ownerId, videoId] = vkParsed.externalId.split('_');
          if (ownerId && videoId) {
            const info = await getVkVideoInfo(ownerId, videoId);
            candidates.push({
              platform: 'vk',
              externalId: vkParsed.externalId,
              title: info.title,
              channelName: info.channelName,
              thumbnailUrl: info.thumbnailUrl,
              duration: info.duration,
            });
          }
          continue;
        }

        const rutubeParsed = parseRutubeUrl(line);
        if (rutubeParsed) {
          const info = await getRutubeInfo(rutubeParsed.externalId);
          candidates.push({
            platform: 'rutube',
            externalId: rutubeParsed.externalId,
            title: info.title,
            channelName: info.channelName,
            thumbnailUrl: info.thumbnailUrl,
            duration: info.duration,
          });
          continue;
        }
      } catch (err) {
        serviceLogger.warn(
          { url: line, error: err instanceof Error ? err.message : String(err) },
          'Failed to fetch info for AI-found URL'
        );
      }
    }

    serviceLogger.info(
      { count: candidates.length, title },
      'AI alt search completed'
    );
    return candidates;
  } catch (err) {
    serviceLogger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'AI alt search failed'
    );
    return [];
  }
}
