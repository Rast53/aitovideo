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

export function Player({ video, onClose, onDelete, onMarkWatched }: PlayerProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // Сначала пробуем Telegram WebApp requestFullscreen (Bot API 7.7+)
        if (window.Telegram?.WebApp?.requestFullscreen) {
          window.Telegram.WebApp.requestFullscreen();
          return;
        }
        // Запрашиваем fullscreen на обёртке или iframe
        const element = wrapperRef.current ?? iframeRef.current;
        if (element) {
          if (element.requestFullscreen) {
            await element.requestFullscreen();
          } else if ((element as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
            (element as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
          }
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
          (document as Document & { webkitExitFullscreen: () => void }).webkitExitFullscreen();
        }
      }
    } catch {
      // Fullscreen API недоступен в данном окружении
    }
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
        if (!oid || !vid) {
          return null;
        }

        return `https://vk.com/video_ext.php?oid=${oid}&id=${vid}&hd=2&autoplay=1`;
      }
      default:
        return null;
    }
  };

  const embedUrl = getEmbedUrl();
  const isWatched = Boolean(video.is_watched);

  return (
    <div className="player-overlay" onClick={onClose}>
      <div className="player-container" onClick={(event) => event.stopPropagation()}>
        <div className="player-header">
          <button className="player-close-btn" onClick={onClose}>
            ✕
          </button>
          <div className="player-title">
            {platformIcons[video.platform]} {video.title}
          </div>
          <button
            className="player-fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          >
            {isFullscreen ? '⛶' : '⛶'}
            <span className="player-fullscreen-icon">{isFullscreen ? '↙' : '↗'}</span>
          </button>
        </div>

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
        </div>

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
      </div>
    </div>
  );
}

export default Player;
