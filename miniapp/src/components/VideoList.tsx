import { VideoCard } from './VideoCard';
import type { Video } from '../types/api';
import './VideoList.css';

interface VideoListProps {
  videos: Video[];
  onVideoClick?: (video: Video) => void;
  onDelete?: (id: number) => void;
  onMarkWatched?: (id: number, isWatched: boolean) => void;
  loading: boolean;
}

export function VideoList({
  videos,
  onVideoClick,
  onDelete,
  onMarkWatched,
  loading
}: VideoListProps) {
  if (loading) {
    return (
      <div className="video-list-loading">
        <div className="spinner" />
        <p>Загрузка...</p>
      </div>
    );
  }

  if (!videos || videos.length === 0) {
    return (
      <div className="video-list-empty">
        <div className="empty-icon">📺</div>
        <h3>Нет видео</h3>
        <p>Отправь ссылку боту, и она появится здесь</p>
      </div>
    );
  }

  // Group videos: find roots and their alternatives
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
          />
        );
      })}
    </div>
  );
}

export default VideoList;
