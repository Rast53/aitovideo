import type {
  DeleteVideoResponse,
  ErrorPayload,
  GetMeResponse,
  GetVideosResponse,
  MarkAsWatchedResponse
} from './types/api';

const API_URL: string = import.meta.env.VITE_API_URL ?? '';

// Get initData from Telegram WebApp
function getInitData(): string {
  if (window.Telegram?.WebApp) {
    return window.Telegram.WebApp.initData;
  }

  return '';
}

// Base fetch with auth
async function fetchWithAuth<TResponse>(endpoint: string, options: RequestInit = {}): Promise<TResponse> {
  const initData = getInitData();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Telegram-Init-Data', initData);

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Unknown error' }))) as ErrorPayload;
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

// API methods
export const api = {
  // User
  getMe: (): Promise<GetMeResponse> => fetchWithAuth<GetMeResponse>('/api/me'),

  // Videos
  getVideos: (): Promise<GetVideosResponse> => fetchWithAuth<GetVideosResponse>('/api/videos'),
  deleteVideo: (id: number): Promise<DeleteVideoResponse> =>
    fetchWithAuth<DeleteVideoResponse>(`/api/videos/${id}`, { method: 'DELETE' }),
  markAsWatched: (id: number, isWatched: boolean): Promise<MarkAsWatchedResponse> =>
    fetchWithAuth<MarkAsWatchedResponse>(`/api/videos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isWatched })
    })
};

export default api;
