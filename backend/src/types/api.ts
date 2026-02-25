import type { TelegramUser } from './user.js';
import type { Video } from './video.js';

export interface ErrorResponse {
  error: string;
  message?: string;
}

export interface GetVideosResponse {
  videos: Video[];
}

export interface AddVideoRequestBody {
  url: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface AddVideoResponse {
  video: Video;
}

export interface DeleteVideoResponse {
  success: true;
}

export interface UpdateVideoRequestBody {
  isWatched?: boolean;
}

export interface UpdateVideoResponse {
  video: Video;
}

export interface MeResponse {
  user: {
    id: number;
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface TelegramAuthResult {
  valid: boolean;
  user?: TelegramUser | null;
  error?: string;
}

export interface VideoProgress {
  id: number;
  user_id: number;
  video_id: number;
  position_seconds: number;
  updated_at: string;
}

export interface GetProgressResponse {
  progress: VideoProgress | null;
}

export interface SaveProgressRequestBody {
  video_id: number;
  position_seconds: number;
}

export interface SaveProgressResponse {
  progress: VideoProgress;
}
