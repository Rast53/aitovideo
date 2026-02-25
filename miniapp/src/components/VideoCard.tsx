import type { MouseEvent } from 'react';
import type { Video, VideoPlatform } from '../types/api';
import './VideoCard.css';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';

/**
 * For VK videos the CDN blocks direct browser requests.
 * Route the thumbnail through our backend proxy instead.
 */
function getThumbnailSrc(video: Video): string | null {
  if (!video.thumbnail_url) return null;
  if (video.platform === 'vk') {
    return `${API_URL}/api/proxy/thumbnail?url=${encodeURIComponent(video.thumbnail_url)}`;
  }
  return video.thumbnail_url;
}

const platformIcons: Record<VideoPlatform, string> = {
  youtube: '📺',
  rutube: '▶️',
  vk: '🔴'
};

function formatDuration(seconds: number | null): string {
  if (!seconds) {
    return '';
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface VideoCardProps {
  video: Video;
  onClick?: (video: Video) => void;
  onDelete?: (id: number) => void;
}

export function VideoCard({ video, onClick, onDelete }: VideoCardProps) {
  const handleDelete = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (window.confirm('Удалить видео из очереди?')) {
      onDelete?.(video.id);
    }
  };

  const thumbnailSrc = getThumbnailSrc(video);

  return (
    <div className="video-card" onClick={() => onClick?.(video)}>
      <div className="video-thumbnail">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={video.title}
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = 'none';
              const placeholder = target.nextElementSibling as HTMLElement | null;
              if (placeholder) placeholder.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="video-thumbnail-placeholder"
          style={{ display: thumbnailSrc ? 'none' : 'flex' }}
        >
          {platformIcons[video.platform] ?? '📹'}
        </div>
        {video.duration !== null && video.duration > 0 && (
          <span className="video-duration">{formatDuration(video.duration)}</span>
        )}
        {Boolean(video.is_watched) && <span className="video-watched-badge">✓</span>}
      </div>

      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <p className="video-channel">
          {platformIcons[video.platform]} {video.channel_name ?? 'Unknown'}
        </p>
      </div>

      <button className="video-delete-btn" onClick={handleDelete} title="Удалить">
        🗑️
      </button>
    </div>
  );
}

export default VideoCard;
