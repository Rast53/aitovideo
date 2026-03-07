import Hls from 'hls.js';
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { api } from '../api';
import type { Video, VideoPlatform, VideoProgress } from '../types/api';
import './Player.css';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';
const PLAYER_ZOOM_STORAGE_KEY = 'aitovideo.player.zoom';

interface PlayerProps {
  video: Video;
  alternatives?: Video[];
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getTouchesDistance(touches: ReactTouchEvent<HTMLDivElement>['touches']): number {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const DOUBLE_TAP_DELAY_MS = 280;

function clampZoomScale(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(3))));
}

function getInitialZoomScale(): number {
  if (typeof window === 'undefined') return ZOOM_MIN;
  try {
    const storedValue = window.localStorage.getItem(PLAYER_ZOOM_STORAGE_KEY);
    if (!storedValue) return ZOOM_MIN;
    const parsed = Number.parseFloat(storedValue);
    if (!Number.isFinite(parsed)) return ZOOM_MIN;
    return clampZoomScale(parsed);
  } catch {
    return ZOOM_MIN;
  }
}

// ─── Smart source selection ───────────────────────────────────────────────────
// Prefer alternatives on platforms with better availability / no proxy overhead.
// Rutube & VK are natively available in target regions; YouTube needs VPS proxy.

const PLATFORM_SCORE: Record<VideoPlatform, number> = {
  rutube: 3,
  vk: 2,
  youtube: 1,
};

function selectBestSource(video: Video, alternatives: Video[]): Video {
  const candidates = [video, ...alternatives];
  return candidates.reduce((best, current) => {
    const bestScore = PLATFORM_SCORE[best.platform] ?? 0;
    const currentScore = PLATFORM_SCORE[current.platform] ?? 0;
    return currentScore > bestScore ? current : best;
  });
}

const MIN_RESUME_SECONDS = 10;
const SAVE_INTERVAL_MS = 10_000;
const BACK_BUTTON_HIDE_MS = 3_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function Player({ video, alternatives = [], onClose }: PlayerProps) {
  const bestSource = selectBestSource(video, alternatives);

  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [zoomScale, setZoomScale] = useState(getInitialZoomScale);
  const [isPinching, setIsPinching] = useState(false);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [savedProgress, setSavedProgress] = useState<VideoProgress | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [startFrom, setStartFrom] = useState(0);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [isBackButtonVisible, setIsBackButtonVisible] = useState(true);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backButtonHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(ZOOM_MIN);
  const lastTapTimestampRef = useRef(0);
  const videoIdRef = useRef(video.id);
  useEffect(() => { videoIdRef.current = video.id; }, [video.id]);

  function clearTimers() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (saveTimerRef.current) { clearInterval(saveTimerRef.current); saveTimerRef.current = null; }
  }

  function clearBackButtonHideTimer() {
    if (backButtonHideTimerRef.current) {
      window.clearTimeout(backButtonHideTimerRef.current);
      backButtonHideTimerRef.current = null;
    }
  }

  function restartBackButtonHideTimer() {
    clearBackButtonHideTimer();
    backButtonHideTimerRef.current = window.setTimeout(() => {
      setIsBackButtonVisible(false);
      backButtonHideTimerRef.current = null;
    }, BACK_BUTTON_HIDE_MS);
  }

  function handlePlayerInteraction() {
    setIsBackButtonVisible(true);
    restartBackButtonHideTimer();
  }

  function resetZoom() {
    setZoomScale(ZOOM_MIN);
    setIsPinching(false);
    pinchStartDistanceRef.current = null;
    pinchStartScaleRef.current = ZOOM_MIN;
  }

  function handleZoomTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    handlePlayerInteraction();

    if (event.touches.length === 2) {
      pinchStartDistanceRef.current = getTouchesDistance(event.touches);
      pinchStartScaleRef.current = zoomScale;
      setIsPinching(true);
      lastTapTimestampRef.current = 0;
      return;
    }

    if (event.touches.length !== 1) return;

    const now = Date.now();
    if (now - lastTapTimestampRef.current <= DOUBLE_TAP_DELAY_MS) {
      event.preventDefault();
      resetZoom();
      lastTapTimestampRef.current = 0;
      return;
    }

    lastTapTimestampRef.current = now;
  }

  function handleZoomTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || pinchStartDistanceRef.current === null) return;

    const currentDistance = getTouchesDistance(event.touches);
    if (currentDistance <= 0) return;

    event.preventDefault();
    const ratio = currentDistance / pinchStartDistanceRef.current;
    const nextScale = clampZoomScale(pinchStartScaleRef.current * ratio);
    setZoomScale(nextScale);
  }

  function handleZoomTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length >= 2) return;
    pinchStartDistanceRef.current = null;
    pinchStartScaleRef.current = zoomScale;
    setIsPinching(false);
  }

  function handleZoomTouchCancel() {
    pinchStartDistanceRef.current = null;
    pinchStartScaleRef.current = zoomScale;
    setIsPinching(false);
  }

  // ── Persist zoom scale preference ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PLAYER_ZOOM_STORAGE_KEY, String(zoomScale));
    } catch {
      // Ignore browsers where localStorage is disabled.
    }
  }, [zoomScale]);

  // ── Reset player state when video changes ──────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setVideoError(false);
    setSavedProgress(null);
    setShowResumeModal(false);
    setStartFrom(0);
    setPlaybackReady(false);
    setIsPinching(false);
    pinchStartDistanceRef.current = null;
    pinchStartScaleRef.current = ZOOM_MIN;
    lastTapTimestampRef.current = 0;
  }, [video.id]);

  // ── Cleanup HLS instance on unmount or source change ───────────────────────
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [video.id]);

  // ── Unmount: flush final position ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimers();
      const el = nativeVideoRef.current;
      const pos = el ? Math.floor(el.currentTime) : elapsedRef.current;
      if (pos >= MIN_RESUME_SECONDS) {
        api.saveProgress(videoIdRef.current, pos).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back button auto-hide
  useEffect(() => {
    setIsBackButtonVisible(true);
    restartBackButtonHideTimer();
    return () => { clearBackButtonHideTimer(); };
  }, [video.id]);

  // ── Fetch saved progress on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api.getProgress(video.id)
      .then((res) => {
        if (cancelled) return;
        const p = res.progress;
        if (p && p.position_seconds >= MIN_RESUME_SECONDS) {
          setSavedProgress(p);
          setShowResumeModal(true);
        } else {
          setPlaybackReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPlaybackReady(true);
      });
    return () => { cancelled = true; };
  }, [video.id]);

  // ── Set up video source once playback is ready ─────────────────────────────
  useEffect(() => {
    if (!playbackReady || !nativeVideoRef.current) return;

    let cancelled = false;
    const videoEl = nativeVideoRef.current;

    async function setupSource() {
      try {
        const info = await api.resolveStream(bestSource.platform, bestSource.external_id);
        if (cancelled) return;

        const fullUrl = `${API_URL}${info.streamUrl}`;

        if (info.type === 'hls') {
          if (Hls.isSupported()) {
            const hls = new Hls({
              startPosition: startFrom > 0 ? startFrom : -1,
            });
            hlsRef.current = hls;
            hls.loadSource(fullUrl);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (!cancelled) {
                setLoading(false);
                videoEl.play().catch(() => {});
              }
            });
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal && !cancelled) {
                setLoading(false);
                setVideoError(true);
              }
            });
          } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = fullUrl;
            if (startFrom > 0) {
              videoEl.addEventListener('loadedmetadata', () => {
                videoEl.currentTime = startFrom;
              }, { once: true });
            }
          } else {
            setLoading(false);
            setVideoError(true);
          }
        } else {
          videoEl.src = fullUrl;
          if (startFrom > 0) {
            videoEl.addEventListener('loadedmetadata', () => {
              videoEl.currentTime = startFrom;
            }, { once: true });
          }
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setVideoError(true);
        }
      }
    }

    void setupSource();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playbackReady, bestSource.platform, bestSource.external_id, startFrom]);

  // ── Start elapsed timer + periodic save once playback begins ───────────────
  useEffect(() => {
    if (!playbackReady) return;

    elapsedRef.current = startFrom;

    timerRef.current = setInterval(() => {
      const el = nativeVideoRef.current;
      if (el && !el.paused) {
        elapsedRef.current = Math.floor(el.currentTime);
      }
    }, 1000);

    saveTimerRef.current = setInterval(() => {
      const el = nativeVideoRef.current;
      const pos = el ? Math.floor(el.currentTime) : elapsedRef.current;
      if (pos >= MIN_RESUME_SECONDS) {
        api.saveProgress(videoIdRef.current, pos).catch(() => {});
      }
    }, SAVE_INTERVAL_MS);

    return clearTimers;
  }, [playbackReady, startFrom]);

  // ── Resume handlers ───────────────────────────────────────────────────────
  const handleResumeYes = () => {
    setStartFrom(savedProgress?.position_seconds ?? 0);
    setShowResumeModal(false);
    setPlaybackReady(true);
  };

  const handleResumeNo = () => {
    setStartFrom(0);
    setShowResumeModal(false);
    setPlaybackReady(true);
    api.saveProgress(video.id, 0).catch(() => {});
  };

  if (!video) return null;

  const isProgressLoading = !showResumeModal && !playbackReady;
  const isTopControlsVisible = isBackButtonVisible;

  const resumeProgressFraction = savedProgress && video.duration
    ? Math.min(savedProgress.position_seconds / video.duration, 1)
    : 0;

  return (
    <div className="player-overlay" onClick={onClose}>
      <div
        className="player-container"
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={handlePlayerInteraction}
        ref={wrapperRef}
      >

        {/* ── Top controls: back ─────────────────────────────────────────── */}
        {isTopControlsVisible && (
          <div className="player-top-controls">
            <button
              type="button"
              className="player-back-btn"
              onClick={onClose}
              aria-label="Назад к списку"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── Resume modal ─────────────────────────────────────────────── */}
        {showResumeModal && savedProgress && (
          <div className="resume-modal-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="resume-modal">
              <div className="resume-modal__icon">▶️</div>
              <p className="resume-modal__text">
                Продолжить просмотр с{' '}
                <strong>{formatTime(savedProgress.position_seconds)}</strong>?
              </p>
              {resumeProgressFraction > 0 && (
                <div className="resume-modal__progress-track">
                  <div
                    className="resume-modal__progress-fill"
                    style={{ width: `${resumeProgressFraction * 100}%` }}
                  />
                </div>
              )}
              <div className="resume-modal__actions">
                <button className="resume-modal__btn resume-modal__btn--primary" onClick={handleResumeYes}>
                  Продолжить
                </button>
                <button className="resume-modal__btn resume-modal__btn--secondary" onClick={handleResumeNo}>
                  С начала
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Video area ───────────────────────────────────────────────── */}
        {(loading || isProgressLoading) && (
          <div className="player-loading"><div className="spinner" /></div>
        )}

        <div
          className="player-media-stage"
          onDoubleClick={resetZoom}
          onTouchStart={handleZoomTouchStart}
          onTouchMove={handleZoomTouchMove}
          onTouchEnd={handleZoomTouchEnd}
          onTouchCancel={handleZoomTouchCancel}
        >
          <div
            className={`player-media-content${isPinching ? ' player-media-content--pinching' : ''}`}
            style={{ transform: `scale(${zoomScale})` }}
          >
            {playbackReady && !videoError && (
              <video
                ref={nativeVideoRef}
                className="player-native-video"
                autoPlay
                controls
                playsInline
                onCanPlay={() => setLoading(false)}
                onError={() => { setLoading(false); setVideoError(true); }}
              />
            )}
          </div>
        </div>

        {/* Error state */}
        {!isProgressLoading && !showResumeModal && videoError && (
          <div className="player-error">Не удалось загрузить видео</div>
        )}

      </div>
    </div>
  );
}

export default Player;
