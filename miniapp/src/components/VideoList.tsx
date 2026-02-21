import { VideoCard } from './VideoCard';
import type { Video } from '../types/api';
import './VideoList.css';

interface VideoListProps {
  videos: Video[];
  onVideoClick?: (video: Video) => void;
  onDelete?: (id: number) => void;
  loading: boolean;
}

export function VideoList({
  videos,
  onVideoClick,
  onDelete,
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

  return (
    <div className="video-list">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} onClick={onVideoClick} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default VideoList;
