export type VideoPlatform = 'youtube' | 'rutube' | 'vk';

export interface Video {
  id: number;
  user_id: number;
  platform: VideoPlatform;
  external_id: string;
  url: string;
  title: string;
  channel_name: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  is_watched: number | boolean;
  parent_id: number | null;
  created_at: string;
}

export interface AppUser {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface GetMeResponse {
  user: AppUser;
}

export interface GetVideosResponse {
  videos: Video[];
}

export interface DeleteVideoResponse {
  success: true;
}

export interface MarkAsWatchedResponse {
  video: Video;
}

export interface ErrorPayload {
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

export interface SaveProgressResponse {
  progress: VideoProgress;
}
