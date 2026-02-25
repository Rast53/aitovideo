import { useCallback, useEffect, useRef, useState } from 'react';
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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Minimum position (seconds) worth saving/resuming from
const MIN_RESUME_POSITION = 10;
// Save progress every N seconds of elapsed watch time
const SAVE_INTERVAL_MS = 10_000;

export function Player({ video, onClose, onDelete, onMarkWatched }: PlayerProps) {
  const [loading, setLoading] = useState(true);
  const [isCinemaMode, setIsCinemaMode] = useState(false);

  // Progress / resume state
  const [savedProgress, setSavedProgress] = useState<VideoProgress | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [resumeFrom, setResumeFrom] = useState(0);
  const [progressLoading, setProgressLoading] = useState(true);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Track elapsed seconds since playback started
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startPositionRef = useRef(0);

  // Fetch saved progress on mount
  useEffect(() => {
    let cancelled = false;
    setProgressLoading(true);

    api.getProgress(video.id)
      .then((res) => {
        if (cancelled) return;
        const p = res.progress;
        if (p && p.position_seconds >= MIN_RESUME_POSITION) {
          setSavedProgress(p);
          setShowResumeModal(true);
        } else {
          setSavedProgress(null);
          setShowResumeModal(false);
        }
      })
      .catch(() => {
        // Ignore errors — just start from beginning
      })
      .finally(() => {
        if (!cancelled) setProgressLoading(false);
      });

    return () => { cancelled = true; };
  }, [video.id]);

  // Start tracking elapsed time once iframe loads (after resume decision)
  const startTracking = useCallback((fromSeconds: number) => {
    startPositionRef.current = fromSeconds;
    elapsedRef.current = fromSeconds;

    // Increment elapsed every second
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
    }, 1000);

    // Save progress every SAVE_INTERVAL_MS
    saveTimerRef.current = setInterval(() => {
      const pos = elapsedRef.current;
      if (pos >= MIN_RESUME_POSITION) {
        api.saveProgress(video.id, pos).catch(() => { /* silent */ });
      }
    }, SAVE_INTERVAL_MS);
  }, [video.id]);

  const stopTracking = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      stopTracking();
      const pos = elapsedRef.current;
      if (pos >= MIN_RESUME_POSITION) {
        api.saveProgress(video.id, pos).catch(() => { /* silent */ });
      }
    };
  }, [video.id, stopTracking]);

  // Отслеживаем выход из нативного fullscreen (например, через кнопку назад)
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand();
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as ExtendedDocument;
      const isNativeFsActive = !!(document.fullscreenElement || doc.webkitFullscreenElement);
      if (!isNativeFsActive && isCinemaMode) {
        // нативный fullscreen закрылся, кино-режим (скрытые панели) оставляем
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [isCinemaMode]);

  const enterCinemaMode = async () => {
    if (window.Telegram?.WebApp?.requestFullscreen) {
      try { window.Telegram.WebApp.requestFullscreen(); } catch { /* не поддерживается */ }
    }

    const el = wrapperRef.current as ExtendedHTMLElement | null;
    if (el && !document.fullscreenElement) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      } catch { /* WebView не поддерживает Fullscreen API */ }
    }

    try {
      const orientation = screen.orientation as ExtendedScreenOrientation;
      if (orientation?.lock) { await orientation.lock('landscape'); }
    } catch { /* Screen Orientation API недоступен */ }

    setIsCinemaMode(true);
  };

  const exitCinemaMode = async () => {
    const doc = document as ExtendedDocument;
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* игнорируем */ }
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      try { doc.webkitExitFullscreen(); } catch { /* игнорируем */ }
    }

    if (window.Telegram?.WebApp?.exitFullscreen) {
      try { window.Telegram.WebApp.exitFullscreen(); } catch { /* игнорируем */ }
    }

    try {
      const orientation = screen.orientation as ExtendedScreenOrientation;
      if (orientation?.unlock) { orientation.unlock(); }
    } catch { /* игнорируем */ }

    setIsCinemaMode(false);
  };

  if (!video) return null;

  const getEmbedUrl = (startSeconds = 0): string | null => {
    const t = Math.floor(startSeconds);
    switch (video.platform) {
      case 'youtube':
        return `https://www.youtube-nocookie.com/embed/${video.external_id}?autoplay=1${t > 0 ? `&start=${t}` : ''}`;
      case 'rutube':
        return `https://rutube.ru/play/embed/${video.external_id}${t > 0 ? `?t=${t}` : ''}`;
      case 'vk': {
        const [oid, vid] = video.external_id.split('_');
        if (!oid || !vid) return null;
        return `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&autoplay=1`;
      }
      default:
        return null;
    }
  };

  const handleResumeYes = () => {
    const pos = savedProgress?.position_seconds ?? 0;
    setResumeFrom(pos);
    setShowResumeModal(false);
    startTracking(pos);
  };

  const handleResumeNo = () => {
    setResumeFrom(0);
    setShowResumeModal(false);
    startTracking(0);
    // Reset progress to 0 on server
    api.saveProgress(video.id, 0).catch(() => { /* silent */ });
  };

  const handleIframeLoad = () => {
    setLoading(false);
    // Start tracking only if resume modal is not shown (user already made a decision)
    if (!showResumeModal && timerRef.current === null) {
      startTracking(resumeFrom);
    }
  };

  const embedUrl = getEmbedUrl(resumeFrom);
  const isWatched = Boolean(video.is_watched);

  // Show loading spinner while fetching saved progress
  if (progressLoading) {
    return (
      <div className="player-overlay">
        <div className="player-container">
          <div className="player-loading">
            <div className="spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`player-overlay${isCinemaMode ? ' player-overlay--cinema' : ''}`}
      onClick={isCinemaMode ? exitCinemaMode : onClose}
    >
      <div
        className={`player-container${isCinemaMode ? ' player-container--cinema' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Resume modal */}
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

        {/* Шапка скрывается в кино-режиме */}
        {!isCinemaMode && (
          <div className="player-header">
            <button className="player-close-btn" onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
            <div className="player-title">
              {platformIcons[video.platform]} {video.title}
            </div>
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

        {/* Зона видео */}
        <div className="player-video-wrapper" ref={wrapperRef}>
          {loading && !showResumeModal && (
            <div className="player-loading">
              <div className="spinner" />
            </div>
          )}
          {!showResumeModal && (
            embedUrl ? (
              <iframe
                ref={iframeRef}
                src={embedUrl}
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                onLoad={handleIframeLoad}
              />
            ) : (
              <div className="player-error">Не удалось загрузить видео</div>
            )
          )}

          {/* Плавающая кнопка выхода из кино-режима */}
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

        {/* Кнопки действий скрываются в кино-режиме */}
        {!isCinemaMode && (
          <div className="player-actions">
            <button
              className="player-action-btn player-action-watched"
              onClick={() => {
                onMarkWatched?.(video.id, !isWatched);
                onClose();
              }}
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
