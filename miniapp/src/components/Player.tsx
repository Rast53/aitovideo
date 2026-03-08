import Hls from 'hls.js';
import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { api } from '../api';
import type { Video, VideoPlatform, VideoProgress } from '../types/api';
import './Player.css';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';
const PLAYER_ZOOM_STORAGE_KEY = 'aitovideo.player.zoom';
const PLAYER_QUALITY_STORAGE_KEY = 'aitovideo.player.quality';
const PLAYER_SPEED_STORAGE_KEY = 'aitovideo.player.speed';
const PLAYER_USE_ALT_STORAGE_KEY = 'aitovideo.player.useAlt';

const QUALITY_OPTIONS = [360, 480, 720, 1080, 1440, 2160] as const;
type QualityOption = (typeof QUALITY_OPTIONS)[number];
const QUALITY_LABELS: Record<QualityOption, string> = {
  360: '360p', 480: '480p', 720: '720p', 1080: '1080p', 1440: '2K', 2160: '4K',
};

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
type SpeedOption = (typeof SPEED_OPTIONS)[number];

function lsGet<T>(key: string, fallback: T, parse: (v: string) => T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key: string, value: string | number | boolean): void {
  try { window.localStorage.setItem(key, String(value)); } catch { /* noop */ }
}

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
  // ── Player controls state ──────────────────────────────────────────────────
  const [preferredQuality, setPreferredQuality] = useState<QualityOption>(
    () => lsGet(PLAYER_QUALITY_STORAGE_KEY, 1080 as QualityOption, (v) => {
      const n = parseInt(v, 10);
      return (QUALITY_OPTIONS as readonly number[]).includes(n) ? n as QualityOption : 1080;
    })
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<SpeedOption>(
    () => lsGet(PLAYER_SPEED_STORAGE_KEY, 1 as SpeedOption, (v) => {
      const n = parseFloat(v);
      return (SPEED_OPTIONS as readonly number[]).includes(n) ? n as SpeedOption : 1;
    })
  );
  const [useAlt, setUseAlt] = useState<boolean>(
    () => lsGet(PLAYER_USE_ALT_STORAGE_KEY, true, (v) => v !== 'false')
  );
  const [openMenu, setOpenMenu] = useState<'quality' | 'speed' | null>(null);

  // Effective source: if useAlt and alternatives exist, use selectBestSource; else use original
  const effectiveSource = useAlt ? selectBestSource(video, alternatives) : video;
  const hasAlternatives = alternatives.length > 0;
  const isNativeVideo = effectiveSource.platform === 'youtube';

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
        const qualityParam = effectiveSource.platform === 'youtube' ? preferredQuality : undefined;
        const info = await api.resolveStream(effectiveSource.platform, effectiveSource.external_id, qualityParam);
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
      // Reset video element so stale source doesn't show while new one loads
      if (nativeVideoRef.current) {
        nativeVideoRef.current.pause();
        nativeVideoRef.current.removeAttribute('src');
        nativeVideoRef.current.load();
      }
      setLoading(true);
      setVideoError(false);
    };
  }, [playbackReady, effectiveSource.platform, effectiveSource.external_id, startFrom, preferredQuality]);

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

  // ── Apply playback speed ───────────────────────────────────────────────────
  useEffect(() => {
    if (nativeVideoRef.current) {
      nativeVideoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // ── Persist controls preferences ───────────────────────────────────────────
  useEffect(() => { lsSet(PLAYER_QUALITY_STORAGE_KEY, preferredQuality); }, [preferredQuality]);
  useEffect(() => { lsSet(PLAYER_SPEED_STORAGE_KEY, playbackSpeed); }, [playbackSpeed]);
  useEffect(() => { lsSet(PLAYER_USE_ALT_STORAGE_KEY, useAlt); }, [useAlt]);

  // ── Reset when quality changes (reload stream) ─────────────────────────────
  // (handled by dependency in setupSource effect above)

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

        {/* ── Top controls ───────────────────────────────────────────────── */}
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

            <div className="player-controls-right">
              {/* Quality selector — YouTube only */}
              {isNativeVideo && (
                <div className="player-control-wrap">
                  <button
                    type="button"
                    className="player-control-btn"
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'quality' ? null : 'quality'); }}
                    aria-label="Качество видео"
                  >
                    {QUALITY_LABELS[preferredQuality]} ▾
                  </button>
                  {openMenu === 'quality' && (
                    <div className="player-control-popup" onClick={(e) => e.stopPropagation()}>
                      {QUALITY_OPTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className={`player-control-popup__item${q === preferredQuality ? ' player-control-popup__item--active' : ''}`}
                          onClick={() => {
                            setPreferredQuality(q);
                            setOpenMenu(null);
                            // Trigger stream reload
                            setPlaybackReady(false);
                            setTimeout(() => setPlaybackReady(true), 50);
                          }}
                        >
                          {QUALITY_LABELS[q]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Speed selector — YouTube native video only */}
              {isNativeVideo && (
                <div className="player-control-wrap">
                  <button
                    type="button"
                    className="player-control-btn"
                    onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'speed' ? null : 'speed'); }}
                    aria-label="Скорость воспроизведения"
                  >
                    {playbackSpeed === 1 ? '1×' : `${playbackSpeed}×`} ▾
                  </button>
                  {openMenu === 'speed' && (
                    <div className="player-control-popup" onClick={(e) => e.stopPropagation()}>
                      {SPEED_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`player-control-popup__item${s === playbackSpeed ? ' player-control-popup__item--active' : ''}`}
                          onClick={() => { setPlaybackSpeed(s); setOpenMenu(null); }}
                        >
                          {s === 1 ? '1×' : `${s}×`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Alt-source toggle — only if alternatives exist */}
              {hasAlternatives && (
                <button
                  type="button"
                  className={`player-control-btn player-control-btn--alt${useAlt ? ' player-control-btn--alt-on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setUseAlt((v) => !v); }}
                  aria-label={useAlt ? 'Использовать оригинал' : 'Использовать альтернативу'}
                >
                  ALT {useAlt ? '●' : '○'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Popup backdrop — closes any open menu */}
        {openMenu && (
          <div
            className="player-popup-backdrop"
            onPointerDown={() => setOpenMenu(null)}
          />
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
