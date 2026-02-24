import { useEffect, useRef, useState } from 'react';
import type { Video, VideoPlatform } from '../types/api';
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

export function Player({ video, onClose, onDelete, onMarkWatched }: PlayerProps) {
  const [loading, setLoading] = useState(true);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand();
    }
  }, []);

  // Отслеживаем выход из нативного fullscreen (например, через кнопку назад)
  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as ExtendedDocument;
      const isNativeFsActive = !!(document.fullscreenElement || doc.webkitFullscreenElement);
      if (!isNativeFsActive && isCinemaMode) {
        // нативный fullscreen закрылся, но кино-режим (скрытые панели) оставляем
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
    // Уровень 1: Telegram WebApp requestFullscreen (Bot API 7.7+)
    if (window.Telegram?.WebApp?.requestFullscreen) {
      try {
        window.Telegram.WebApp.requestFullscreen();
      } catch {
        // не поддерживается в данной версии
      }
    }

    // Уровень 2: Нативный Fullscreen API на обёртке видео
    const el = wrapperRef.current as ExtendedHTMLElement | null;
    if (el && !document.fullscreenElement) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      } catch {
        // WebView не поддерживает Fullscreen API
      }
    }

    // Уровень 3: Блокировка ориентации в landscape
    try {
      const orientation = screen.orientation as ExtendedScreenOrientation;
      if (orientation?.lock) {
        await orientation.lock('landscape');
      }
    } catch {
      // Screen Orientation API недоступен
    }

    // Уровень 4 (всегда): скрываем наши панели — кино-режим
    setIsCinemaMode(true);
  };

  const exitCinemaMode = async () => {
    // Выходим из нативного fullscreen если активен
    const doc = document as ExtendedDocument;
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* игнорируем */ }
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      try { doc.webkitExitFullscreen(); } catch { /* игнорируем */ }
    }

    // Выходим из Telegram fullscreen (Bot API 7.7+)
    if (window.Telegram?.WebApp?.exitFullscreen) {
      try { window.Telegram.WebApp.exitFullscreen(); } catch { /* игнорируем */ }
    }

    // Снимаем блокировку ориентации
    try {
      const orientation = screen.orientation as ExtendedScreenOrientation;
      if (orientation?.unlock) {
        orientation.unlock();
      }
    } catch { /* игнорируем */ }

    setIsCinemaMode(false);
  };

  if (!video) {
    return null;
  }

  const getEmbedUrl = (): string | null => {
    switch (video.platform) {
      case 'youtube':
        return `https://www.youtube-nocookie.com/embed/${video.external_id}?autoplay=1`;
      case 'rutube':
        return `https://rutube.ru/play/embed/${video.external_id}`;
      case 'vk': {
        const [oid, vid] = video.external_id.split('_');
        if (!oid || !vid) return null;
        return `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&autoplay=1`;
      }
      default:
        return null;
    }
  };

  const embedUrl = getEmbedUrl();
  const isWatched = Boolean(video.is_watched);

  return (
    <div
      className={`player-overlay${isCinemaMode ? ' player-overlay--cinema' : ''}`}
      onClick={isCinemaMode ? exitCinemaMode : onClose}
    >
      <div
        className={`player-container${isCinemaMode ? ' player-container--cinema' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
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
          {loading && (
            <div className="player-loading">
              <div className="spinner" />
            </div>
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
            <div className="player-error">Не удалось загрузить видео</div>
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
