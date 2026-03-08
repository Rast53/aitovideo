import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { Player } from './components/Player';
import { TabBar } from './components/TabBar';
import type { Tab } from './components/TabBar';
import { VideoList } from './components/VideoList';
import type { AppUser, Video } from './types/api';
import './App.css';

const USE_ALT_STORAGE_KEY = 'aitovideo.player.useAlt';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [altVideoForPlayer, setAltVideoForPlayer] = useState<Video | null>(null);
  const [useAltSource, setUseAltSource] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(USE_ALT_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
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

  const handleSearchAlt = async (id: number): Promise<boolean> => {
    try {
      const result = await api.searchAlternatives(id);
      if (result.found) {
        await loadData();
      }
      return result.found;
    } catch (err) {
      console.error('Failed to search alternatives:', err);
      return false;
    }
  };

  const handleVideoClick = (video: Video): void => {
    let original: Video;
    let alt: Video | null = null;

    if (video.parent_id !== null) {
      const parent = videos.find(v => v.id === video.parent_id);
      original = parent ?? video;
      alt = video;
    } else {
      original = video;
      alt = videos.find(v => v.parent_id === video.id) ?? null;
    }

    if (alt && useAltSource) {
      setSelectedVideo(alt);
      setAltVideoForPlayer(original);
    } else {
      setSelectedVideo(original);
      setAltVideoForPlayer(alt);
    }
  };

  const handleToggleAlt = (): void => {
    const next = !useAltSource;
    setUseAltSource(next);
    try {
      window.localStorage.setItem(USE_ALT_STORAGE_KEY, String(next));
    } catch { /* noop */ }

    if (selectedVideo && altVideoForPlayer) {
      const prev = selectedVideo;
      setSelectedVideo(altVideoForPlayer);
      setAltVideoForPlayer(prev);
    }
  };

  const handleClosePlayer = (): void => {
    setSelectedVideo(null);
    setAltVideoForPlayer(null);
  };

  const closePlayerRef = useRef(handleClosePlayer);
  closePlayerRef.current = handleClosePlayer;

  useEffect(() => {
    if (!selectedVideo) return;
    const tg = window.Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    const handler = () => { closePlayerRef.current(); };
    tg.BackButton.onClick(handler);

    return () => {
      tg.BackButton!.offClick(handler);
      tg.BackButton!.hide();
    };
  }, [selectedVideo]);

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
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <main className="app-content">
        <VideoList
          videos={visibleVideos}
          allVideos={videos}
          loading={loading}
          onVideoClick={handleVideoClick}
          onDelete={handleDelete}
          onMarkWatched={handleMarkWatched}
          onSearchAlt={handleSearchAlt}
          activeTab={activeTab}
        />
      </main>

      {selectedVideo && (
        <Player
          video={selectedVideo}
          altVideo={altVideoForPlayer ?? undefined}
          useAlt={useAltSource}
          onToggleAlt={handleToggleAlt}
          onClose={handleClosePlayer}
        />
      )}
    </div>
  );
}

export default App;
