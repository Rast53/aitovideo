import type { MouseEvent } from 'react';
import type { Video, VideoPlatform } from '../types/api';
import './VideoCard.css';

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

  return (
    <div className="video-card" onClick={() => onClick?.(video)}>
      <div className="video-thumbnail">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            loading="lazy"
            onError={(e) => {
              // If CDN blocks the image (e.g. VK), fall back to platform icon placeholder
              const target = e.currentTarget;
              target.style.display = 'none';
              const placeholder = target.nextElementSibling as HTMLElement | null;
              if (placeholder) placeholder.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="video-thumbnail-placeholder"
          style={{ display: video.thumbnail_url ? 'none' : 'flex' }}
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
