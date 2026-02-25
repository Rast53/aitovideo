import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { Video, VideoPlatform, VideoProgress } from '../types/api';
import './Player.css';

const platformIcons: Record<VideoPlatform, string> = {
  youtube: '📺',
  rutube: '▶️',
  vk: '🔴'
};

interface PlayerProps {
  video: Video;
  onClose: () => void;
  onDelete?: (id: number) => void;
  onMarkWatched?: (id: number, isWatched: boolean) => void;
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

function getEmbedUrl(platform: VideoPlatform, externalId: string, startSeconds: number): string | null {
  const t = Math.floor(startSeconds);
  switch (platform) {
    case 'youtube':
      // youtube-nocookie.com — работает без авторизации в любом WebView
      return `https://www.youtube-nocookie.com/embed/${externalId}?autoplay=1${t > 0 ? `&start=${t}` : ''}`;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function Player({ video, onClose, onDelete, onMarkWatched }: PlayerProps) {
  const [loading, setLoading] = useState(true);
  const [isCinemaMode, setIsCinemaMode] = useState(false);

  // Progress / resume
  const [savedProgress, setSavedProgress] = useState<VideoProgress | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [startFrom, setStartFrom] = useState(0);
  const [playbackReady, setPlaybackReady] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Elapsed timer refs — all platforms use the same simple timer approach.
  // For YouTube the timer is an approximation (cross-origin iframe, no JS API in WebView).
  // For Rutube/VK same limitation applies.
  // The key benefit: timer starts from `startFrom`, so "continue from X" is accurate
  // across sessions even if intra-session seeks are not tracked.
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoIdRef = useRef(video.id);
  useEffect(() => { videoIdRef.current = video.id; }, [video.id]);

  function clearTimers() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (saveTimerRef.current) { clearInterval(saveTimerRef.current); saveTimerRef.current = null; }
  }

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

    // Start elapsed from the resume position so saved value = resume_pos + time_watched
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

  // ── Telegram expand ───────────────────────────────────────────────────────
  useEffect(() => {
    if (window.Telegram?.WebApp) window.Telegram.WebApp.expand();
  }, []);

  // ── Fullscreen change tracking ────────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as ExtendedDocument;
      const active = !!(document.fullscreenElement || doc.webkitFullscreenElement);
      if (!active && isCinemaMode) { /* native FS ended, keep cinema mode */ }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [isCinemaMode]);

  // ── Cinema mode ───────────────────────────────────────────────────────────
  const enterCinemaMode = async () => {
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
    setIsCinemaMode(true);
  };

  const exitCinemaMode = async () => {
    const doc = document as ExtendedDocument;
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* */ }
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      try { doc.webkitExitFullscreen(); } catch { /* */ }
    }
    if (window.Telegram?.WebApp?.exitFullscreen) {
      try { window.Telegram.WebApp.exitFullscreen(); } catch { /* */ }
    }
    try {
      const o = screen.orientation as ExtendedScreenOrientation;
      if (o?.unlock) o.unlock();
    } catch { /* */ }
    setIsCinemaMode(false);
  };

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
  if (!video) return null;

  const isWatched = Boolean(video.is_watched);
  const isProgressLoading = !showResumeModal && !playbackReady;
  const embedUrl = playbackReady ? getEmbedUrl(video.platform, video.external_id, startFrom) : null;

  return (
    <div
      className={`player-overlay${isCinemaMode ? ' player-overlay--cinema' : ''}`}
      onClick={isCinemaMode ? exitCinemaMode : onClose}
    >
      <div
        className={`player-container${isCinemaMode ? ' player-container--cinema' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
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

        {/* ── Header ───────────────────────────────────────────────────── */}
        {!isCinemaMode && (
          <div className="player-header">
            <button className="player-close-btn" onClick={onClose} aria-label="Закрыть">✕</button>
            <div className="player-title">{platformIcons[video.platform]} {video.title}</div>
            <button
              className="player-cinema-btn"
              onClick={enterCinemaMode}
              aria-label="На весь экран"
              title="На весь экран"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M1 1h6v2H3v4H1V1zm12 0h6v6h-2V3h-4V1zM1 13h2v4h4v2H1v-6zm16 4h-4v2h6v-6h-2v4z"/>
              </svg>
            </button>
          </div>
        )}

        {/* ── Video area ───────────────────────────────────────────────── */}
        <div className="player-video-wrapper" ref={wrapperRef}>
          {(loading || isProgressLoading) && (
            <div className="player-loading"><div className="spinner" /></div>
          )}

          {embedUrl ? (
            <iframe
              ref={iframeRef}
              src={embedUrl}
              title={video.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              onLoad={() => setLoading(false)}
            />
          ) : (
            !isProgressLoading && !showResumeModal && (
              <div className="player-error">Не удалось загрузить видео</div>
            )
          )}

          {isCinemaMode && (
            <button
              className="player-exit-cinema-btn"
              onClick={exitCinemaMode}
              aria-label="Выйти из режима просмотра"
              title="Выйти"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 1H1v6h2V3h4V1zm6 0h6v6h-2V3h-4V1zM1 13h2v4h4v2H1v-6zm12 4h4v-4h2v6h-6v-2z"/>
              </svg>
            </button>
          )}
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        {!isCinemaMode && (
          <div className="player-actions">
            <button
              className="player-action-btn player-action-watched"
              onClick={() => { onMarkWatched?.(video.id, !isWatched); onClose(); }}
            >
              {isWatched ? '✓ Просмотрено' : '👁 Отметить просмотренным'}
            </button>
            <button
              className="player-action-btn player-action-delete"
              onClick={() => {
                if (window.confirm('Удалить видео из очереди?')) {
                  onDelete?.(video.id);
                  onClose();
                }
              }}
            >
              🗑 Удалить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Player;
