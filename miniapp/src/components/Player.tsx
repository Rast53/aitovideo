import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { api } from '../api';
import type { Video, VideoPlatform, VideoProgress } from '../types/api';
import './Player.css';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';
const PLAYER_ZOOM_STORAGE_KEY = 'aitovideo.player.zoom';

interface PlayerProps {
  video: Video;
  onClose: () => void;
}

type ExtendedDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void;
};

type ExtendedHTMLElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

type ExtendedScreenOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

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

/**
 * For YouTube we use our own backend proxy (yt-dlp on VPS) instead of iframes.
 * This returns null for YouTube — the component renders a <video> tag instead.
 */
function getEmbedUrl(platform: VideoPlatform, externalId: string, startSeconds: number): string | null {
  const t = Math.floor(startSeconds);
  switch (platform) {
    case 'youtube':
      return null; // handled via <video> + backend proxy
    case 'rutube':
      return `https://rutube.ru/play/embed/${externalId}${t > 0 ? `?t=${t}` : ''}`;
    case 'vk': {
      const [oid, vid] = externalId.split('_');
      if (!oid || !vid) return null;
      return `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&autoplay=1`;
    }
    default:
      return null;
  }
}

const MIN_RESUME_SECONDS = 10;
const SAVE_INTERVAL_MS = 10_000;
const BACK_BUTTON_HIDE_MS = 3_000;

// ─── Component ────────────────────────────────────────────────────────────────

export function Player({ video, onClose }: PlayerProps) {
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [zoomScale, setZoomScale] = useState(getInitialZoomScale);
  const [isPinching, setIsPinching] = useState(false);
  const nativeVideoRef = useRef<HTMLVideoElement>(null);

  // Progress / resume
  const [savedProgress, setSavedProgress] = useState<VideoProgress | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [startFrom, setStartFrom] = useState(0);
  const [playbackReady, setPlaybackReady] = useState(false);
  const [isBackButtonVisible, setIsBackButtonVisible] = useState(true);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  // ── Changing YouTube quality should reload stream ──────────────────────────
  useEffect(() => {
    if (video.platform !== 'youtube') return;
    setLoading(true);
    setVideoError(false);
  }, [video.platform, video.external_id]);

  // ── Unmount: flush final position ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimers();
      const pos = elapsedRef.current;
      if (pos >= MIN_RESUME_SECONDS) {
        api.saveProgress(videoIdRef.current, pos).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Enter fullscreen on mount ─────────────────────────────────────────────
  useEffect(() => {
    const enterFullscreen = async () => {
      if (window.Telegram?.WebApp?.requestFullscreen) {
        try { window.Telegram.WebApp.requestFullscreen(); } catch { /* */ }
      }
      const el = wrapperRef.current as ExtendedHTMLElement | null;
      if (el && !document.fullscreenElement) {
        try {
          if (el.requestFullscreen) await el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } catch { /* */ }
      }
      try {
        const o = screen.orientation as ExtendedScreenOrientation;
        if (o?.lock) await o.lock('landscape');
      } catch { /* */ }
    };

    void enterFullscreen();

    return () => {
      if (window.Telegram?.WebApp?.exitFullscreen) {
        try { window.Telegram.WebApp.exitFullscreen(); } catch { /* */ }
      }
      const doc = document as ExtendedDocument;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
        try { doc.webkitExitFullscreen(); } catch { /* */ }
      }
      try {
        const o = screen.orientation as ExtendedScreenOrientation;
        if (o?.unlock) o.unlock();
      } catch { /* */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fully hide back button after short delay (remove from DOM, no blocking layer)
  useEffect(() => {
    setIsBackButtonVisible(true);
    restartBackButtonHideTimer();

    return () => {
      clearBackButtonHideTimer();
    };
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

  // ── Start elapsed timer once playback begins ──────────────────────────────
  useEffect(() => {
    if (!playbackReady) return;

    elapsedRef.current = startFrom;

    timerRef.current = setInterval(() => { elapsedRef.current += 1; }, 1000);

    saveTimerRef.current = setInterval(() => {
      const pos = elapsedRef.current;
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

  // ─────────────────────────────────────────────────────────────────────────
  // ── Set currentTime for YouTube native video on load ─────────────────────
  useEffect(() => {
    if (video.platform !== 'youtube' || !playbackReady || !nativeVideoRef.current) return;
    const el = nativeVideoRef.current;
    const onMeta = () => {
      if (startFrom > 0) el.currentTime = startFrom;
    };
    el.addEventListener('loadedmetadata', onMeta);
    return () => el.removeEventListener('loadedmetadata', onMeta);
  }, [video.platform, playbackReady, startFrom]);

  if (!video) return null;

  const isProgressLoading = !showResumeModal && !playbackReady;
  const isYoutube = video.platform === 'youtube';
  const embedUrl = playbackReady ? getEmbedUrl(video.platform, video.external_id, startFrom) : null;
  // YouTube stream goes through our backend proxy
  const youtubeStreamUrl = playbackReady && isYoutube
    ? `${API_URL}/api/youtube/stream/${video.external_id}`
    : null;
  const isTopControlsVisible = isBackButtonVisible;

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
            {/* YouTube: native <video> via backend proxy */}
            {youtubeStreamUrl && !videoError && (
              <video
                ref={nativeVideoRef}
                className="player-native-video"
                src={youtubeStreamUrl}
                autoPlay
                controls
                playsInline
                onCanPlay={() => setLoading(false)}
                onError={() => { setLoading(false); setVideoError(true); }}
              />
            )}

            {/* Rutube / VK: iframe embed */}
            {embedUrl && (
              <iframe
                ref={iframeRef}
                src={embedUrl}
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                onLoad={() => setLoading(false)}
              />
            )}
          </div>
        </div>

        {/* Error / no source */}
        {!isProgressLoading && !showResumeModal && !embedUrl && (!youtubeStreamUrl || videoError) && (
          <div className="player-error">Не удалось загрузить видео</div>
        )}

      </div>
    </div>
  );
}

export default Player;
