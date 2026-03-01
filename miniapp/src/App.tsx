import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Player } from './components/Player';
import { TabBar } from './components/TabBar';
import type { Tab } from './components/TabBar';
import { VideoList } from './components/VideoList';
import type { AppUser, Video } from './types/api';
import './App.css';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('videos');

  const visibleVideos = useMemo(() => {
    if (activeTab === 'videos') return videos.filter((v) => !v.is_watched);
    if (activeTab === 'watched') return videos.filter((v) => v.is_watched);
    return [];
  }, [videos, activeTab]);

  // Initialize Telegram WebApp
  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      const bgColor = tg.themeParams.bg_color;
      if (bgColor) {
        tg.setHeaderColor(bgColor);
        tg.setBackgroundColor(bgColor);
      }
    }
  }, []);

  // Load user and videos
  const loadData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const userData = await api.getMe();
      setUser(userData.user);

      const videosData = await api.getVideos();
      setVideos(videosData.videos ?? []);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await api.deleteVideo(id);
      setVideos((prev) => prev.filter((video) => video.id !== id));
    } catch (err) {
      console.error('Failed to delete video:', err);
      window.alert('Не удалось удалить видео');
    }
  };

  const handleMarkWatched = async (id: number, isWatched: boolean): Promise<void> => {
    try {
      const result = await api.markAsWatched(id, isWatched);
      setVideos((prev) => prev.map((video) => (video.id === id ? result.video : video)));
    } catch (err) {
      console.error('Failed to mark as watched:', err);
    }
  };

  const handleVideoClick = (video: Video): void => {
    setSelectedVideo(video);
  };

  const handleClosePlayer = (): void => {
    setSelectedVideo(null);
  };

  if (error) {
    return (
      <div className="app-error">
        <div className="error-icon">⚠️</div>
        <h3>Ошибка загрузки</h3>
        <p>{error}</p>
        <button onClick={() => void loadData()} className="retry-btn">
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Видео</h1>
        {user && <span className="user-name">{user.firstName || user.username}</span>}
      </header>

      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <main className="app-content">
        <VideoList
          videos={visibleVideos}
          loading={loading}
          onVideoClick={handleVideoClick}
          onDelete={handleDelete}
          onMarkWatched={handleMarkWatched}
          activeTab={activeTab}
        />
      </main>

      {selectedVideo && (
        <Player
          video={selectedVideo}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
}

export default App;
