import { useEffect, useState } from 'react';
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

  useEffect(() => {
    // Expand to fullscreen on mobile
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.expand();
    }
  }, []);

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
        </div>

        <div className="player-video-wrapper">
          {loading && (
            <div className="player-loading">
              <div className="spinner" />
            </div>
          )}
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={video.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
