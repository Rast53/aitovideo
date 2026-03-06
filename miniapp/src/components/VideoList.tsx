import { VideoCard } from './VideoCard';
import type { Tab } from './TabBar';
import type { Video } from '../types/api';
import './VideoList.css';

interface VideoListProps {
  videos: Video[];
  onVideoClick?: (video: Video) => void;
  onDelete?: (id: number) => void;
  onMarkWatched?: (id: number, isWatched: boolean) => void;
  onSearchAlt?: (id: number) => Promise<boolean>;
  loading: boolean;
  activeTab?: Tab;
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-thumbnail skeleton-pulse" />
      <div className="skeleton-info">
        <div className="skeleton-line skeleton-line--title skeleton-pulse" />
        <div className="skeleton-line skeleton-line--channel skeleton-pulse" />
      </div>
      <div className="skeleton-actions">
        <div className="skeleton-line skeleton-line--action skeleton-pulse" />
        <div className="skeleton-line skeleton-line--action skeleton-pulse" />
      </div>
    </div>
  );
}

const EMPTY_STATE: Record<Tab, { icon: string; title: string; message: string }> = {
  videos: { icon: '📺', title: 'Нет видео', message: 'Отправь ссылку боту, и она появится здесь' },
  watched: { icon: '✅', title: 'Нет просмотренных', message: 'Отмечай видео как просмотренные, и они появятся здесь' },
  subscriptions: { icon: '🔔', title: 'Подписки появятся здесь', message: 'Скоро тут можно будет подписываться на каналы' },
};

export function VideoList({
  videos,
  onVideoClick,
  onDelete,
  onMarkWatched,
  onSearchAlt,
  loading,
  activeTab = 'videos'
}: VideoListProps) {
  if (loading) {
    return (
      <div className="video-list">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    const empty = EMPTY_STATE[activeTab];
    return (
      <div className="video-list-empty">
        <div className="empty-icon">{empty.icon}</div>
        <h3>{empty.title}</h3>
        <p>{empty.message}</p>
      </div>
    );
  }

  const rootVideos = videos.filter((v) => !v.parent_id);

  return (
    <div className="video-list">
      {rootVideos.map((video) => {
        const alternatives = videos.filter((alt) => alt.parent_id === video.id);
        return (
          <VideoCard
            key={video.id}
            video={video}
            alternatives={alternatives}
            onClick={onVideoClick}
            onDelete={onDelete}
            onMarkWatched={onMarkWatched}
            onSearchAlt={onSearchAlt}
          />
        );
      })}
    </div>
  );
}

export default VideoList;
