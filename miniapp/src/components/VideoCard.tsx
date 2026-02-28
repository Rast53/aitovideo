import type { MouseEvent, ReactNode } from 'react';
import type { Video, VideoPlatform } from '../types/api';
import { YouTubeIcon, VKIcon, RutubeIcon } from './icons/index.js';
import './VideoCard.css';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';

function getThumbnailSrc(video: Video): string | null {
  if (!video.thumbnail_url) return null;
  if (video.platform === 'vk') {
    return `${API_URL}/api/proxy/thumbnail?url=${encodeURIComponent(video.thumbnail_url)}`;
  }
  if (video.platform === 'youtube') {
    const match = video.thumbnail_url.match(/\/vi\/([^\/]+)\//);
    const videoId = match ? match[1] : video.external_id;
    if (videoId) {
      return `${API_URL}/api/youtube/thumbnail/${videoId}`;
    }
  }
  return video.thumbnail_url;
}

const platformNames: Record<VideoPlatform, string> = {
  youtube: 'YouTube',
  rutube: 'Rutube',
  vk: 'VK Video'
};

const platformIconComponents: Record<VideoPlatform, (size: number) => ReactNode> = {
  youtube: (size) => <YouTubeIcon size={size} className="platform-icon" />,
  rutube: (size) => <RutubeIcon size={size} className="platform-icon" />,
  vk: (size) => <VKIcon size={size} className="platform-icon" />,
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface VideoCardProps {
  video: Video;
  alternatives?: Video[];
  onClick?: (video: Video) => void;
  onDelete?: (id: number) => void;
  onMarkWatched?: (id: number, isWatched: boolean) => void;
}

export function VideoCard({ video, alternatives = [], onClick, onDelete, onMarkWatched }: VideoCardProps) {
  const isWatched = Boolean(video.is_watched);

  const handleDelete = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (window.confirm('Удалить видео и все его альтернативы?')) {
      onDelete?.(video.id);
    }
  };

  const handleWatched = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onMarkWatched?.(video.id, !isWatched);
  };

  const handleAltClick = (event: MouseEvent, altVideo: Video): void => {
    event.stopPropagation();
    onClick?.(altVideo);
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
        <div className="video-thumbnail-placeholder" style={{ display: thumbnailSrc ? 'none' : 'flex' }}>
          {platformIconComponents[video.platform]?.(64)}
        </div>
        {video.duration !== null && video.duration > 0 && (
          <span className="video-duration">{formatDuration(video.duration)}</span>
        )}
        {isWatched && <span className="video-watched-badge">✓</span>}
        <span className="video-platform-badge">
          {platformIconComponents[video.platform]?.(16)}
          {platformNames[video.platform]}
        </span>
      </div>

      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <div className="video-meta">
          <p className="video-channel">
            {video.channel_name ?? 'Unknown'}
          </p>

          {alternatives.length > 0 && (
            <div className="video-alternatives">
              <span className="alt-label">Также на:</span>
              {alternatives.map(alt => (
                <button
                  key={alt.id}
                  className="alt-chip"
                  onClick={(e) => handleAltClick(e, alt)}
                  title={platformNames[alt.platform]}
                >
                  {platformIconComponents[alt.platform]?.(16)}
                  <span className="alt-chip-name">{platformNames[alt.platform]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="video-card-actions">
        <button
          className={`video-action-btn${isWatched ? ' video-action-btn--watched-active' : ''}`}
          onClick={handleWatched}
        >
          ✓ {isWatched ? 'Просмотрено' : 'Просмотрено'}
        </button>
        <button className="video-action-btn" onClick={handleDelete}>
          🗑 Удалить
        </button>
      </div>
    </div>
  );
}

export default VideoCard;
