import { parseVkVideoUrl, parseRutubeUrl } from './parser.js';
import { getVkVideoInfo } from './vk.js';
import { getRutubeInfo } from './rutube.js';
import { serviceLogger } from '../logger.js';
import type { BaseVideoInfo, VideoPlatform } from '../types/video.js';

export interface AltCandidate extends BaseVideoInfo {
  platform: VideoPlatform;
  externalId: string;
}

const YANDEX_SEARCH_URL = 'https://searchapi.api.cloud.yandex.net/v2/web/searchAsync';
const YANDEX_OPERATION_URL = 'https://operation.api.cloud.yandex.net/operations/';
const GENERIC_TITLES = new Set(['VK Video', 'Rutube Video', 'Unknown', 'Rutube']);

const VK_URL_RE = /https?:\/\/(?:vk\.com\/video|vkvideo\.ru\/video)-?\d+_\d+/g;
const RUTUBE_URL_RE = /https?:\/\/rutube\.ru\/video\/[a-f0-9]{32}/g;

async function yandexSearch(query: string, apiKey: string, folderId: string): Promise<string[]> {
  // 1. Start async search
  const startRes = await fetch(YANDEX_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { searchType: 'SEARCH_TYPE_RU', queryText: query },
      folderId,
      responseFormat: 'FORMAT_HTML',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!startRes.ok) {
    serviceLogger.warn({ status: startRes.status, query }, 'Yandex Search API start failed');
    return [];
  }

  const operation = (await startRes.json()) as { id?: string };
  if (!operation.id) return [];

  // 2. Poll for result (max 10s)
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const pollRes = await fetch(`${YANDEX_OPERATION_URL}${operation.id}`, {
      headers: { 'Authorization': `Api-Key ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });

    if (!pollRes.ok) continue;

    const result = (await pollRes.json()) as {
      done?: boolean;
      response?: { rawData?: string };
    };

    if (!result.done) continue;

    const rawData = result.response?.rawData;
    if (!rawData) return [];

    const html = Buffer.from(rawData, 'base64').toString('utf-8');

    // Extract clean URLs
    const found = new Set<string>();
    for (const match of html.matchAll(VK_URL_RE)) {
      // Strip trailing junk after the ID
      const clean = match[0].match(/https?:\/\/(?:vk\.com\/video|vkvideo\.ru\/video)-?\d+_\d+/)?.[0];
      if (clean) found.add(clean);
    }
    for (const match of html.matchAll(RUTUBE_URL_RE)) {
      found.add(match[0]);
    }

    return [...found].slice(0, 6);
  }

  serviceLogger.warn({ query }, 'Yandex Search API timed out');
  return [];
}

async function resolveCandidate(rawUrl: string): Promise<AltCandidate | null> {
  try {
    const vkParsed = parseVkVideoUrl(rawUrl);
    if (vkParsed) {
      const [ownerId, videoId] = vkParsed.externalId.split('_');
      if (!ownerId || !videoId) return null;
      const info = await getVkVideoInfo(ownerId, videoId);
      if (GENERIC_TITLES.has(info.title)) return null;
      return { platform: 'vk', externalId: vkParsed.externalId, ...info };
    }

    const rutubeParsed = parseRutubeUrl(rawUrl);
    if (rutubeParsed) {
      const info = await getRutubeInfo(rutubeParsed.externalId);
      if (GENERIC_TITLES.has(info.title)) return null;
      return { platform: 'rutube', externalId: rutubeParsed.externalId, ...info };
    }
  } catch (err) {
    serviceLogger.warn(
      { url: rawUrl, error: err instanceof Error ? err.message : String(err) },
      'Failed to resolve candidate metadata'
    );
  }
  return null;
}

export async function searchAlternatives(
  title: string,
  _channel: string
): Promise<AltCandidate[]> {
  const apiKey = process.env.YANDEX_SEARCH_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    serviceLogger.warn('YANDEX_SEARCH_API_KEY or YANDEX_FOLDER_ID not set — skipping alt search');
    return [];
  }

  serviceLogger.info({ title }, 'Starting Yandex alt search');

  // Search VK and Rutube in parallel
  const [vkUrls, rutubeUrls] = await Promise.all([
    yandexSearch(`${title} site:vk.com/video`, apiKey, folderId),
    yandexSearch(`${title} site:rutube.ru/video`, apiKey, folderId),
  ]);

  const allUrls = [...vkUrls, ...rutubeUrls];
  serviceLogger.info(
    { title, vkCount: vkUrls.length, rutubeCount: rutubeUrls.length },
    'Yandex URLs found'
  );

  const results = await Promise.all(allUrls.map(resolveCandidate));
  const candidates = results.filter((r): r is AltCandidate => r !== null);

  serviceLogger.info({ title, count: candidates.length }, 'Alt search completed');
  return candidates;
}
