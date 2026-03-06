import { VideoModel } from '../models/video.js';
import { findAlternatives } from '../api/routes/videos.js';
import { serviceLogger } from '../logger.js';

const RETRY_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
const INITIAL_DELAY_MS = 60 * 1000; // 60 seconds after startup
const DELAY_BETWEEN_RETRIES_MS = 3_000;

async function processRetryBatch(): Promise<void> {
  const videos = VideoModel.findYouTubeNeedingAltRetry();
  if (videos.length === 0) {
    serviceLogger.debug('Alt retry: no videos needing retry');
    return;
  }

  serviceLogger.info({ count: videos.length }, 'Alt retry: processing batch');

  for (const video of videos) {
    try {
      await findAlternatives(
        video.title,
        video.channel_name ?? '',
        video.duration,
        video.user_id,
        video.id
      );
    } catch (err) {
      serviceLogger.warn(
        { videoId: video.id, error: err instanceof Error ? err.message : String(err) },
        'Alt retry: failed for video'
      );
    }
    await new Promise((r) => setTimeout(r, DELAY_BETWEEN_RETRIES_MS));
  }

  serviceLogger.info({ count: videos.length }, 'Alt retry: batch completed');
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAltRetryScheduler(): void {
  serviceLogger.info(
    { intervalHours: RETRY_INTERVAL_MS / 3_600_000, initialDelaySec: INITIAL_DELAY_MS / 1_000 },
    'Alt retry scheduler configured'
  );

  setTimeout(() => {
    serviceLogger.info('Alt retry: running initial check after startup delay');
    void processRetryBatch();
  }, INITIAL_DELAY_MS);

  intervalHandle = setInterval(() => {
    serviceLogger.info('Alt retry: running scheduled check');
    void processRetryBatch();
  }, RETRY_INTERVAL_MS);
}

export function stopAltRetryScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    serviceLogger.info('Alt retry scheduler stopped');
  }
}
