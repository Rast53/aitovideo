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

export interface CreateVideoInput {
  userId: number;
  platform: VideoPlatform;
  externalId: string;
  url: string;
  title: string;
  channelName?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  parentId?: number | null;
}

export interface ParsedVideoUrl {
  platform: VideoPlatform;
  externalId: string;
  url: string;
}

export interface BaseVideoInfo {
  title: string;
  channelName: string;
  thumbnailUrl: string | null;
  duration: number | null;
  externalId?: string;
}

export interface YouTubeVideoInfo extends BaseVideoInfo {
  instance?: string;
  streamUrl?: string;
}

export interface RutubeVideoInfo extends BaseVideoInfo {
  embedUrl: string;
  html?: string;
}

export interface VkVideoInfo extends BaseVideoInfo {
  embedUrl: string;
}
