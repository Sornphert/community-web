// Social handles keyed by platform. Stored as a jsonb column on profiles
// (default '{}'). Values are handles (e.g. "johndoe"), except `website` which
// stores a full URL. Absent key = not set. Build canonical URLs at render time
// via lib/social.ts; never trust the stored value as a ready href (website is
// scheme-guarded at render).
export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'telegram'
  | 'website'
export type SocialLinks = Partial<Record<SocialPlatform, string>>

export interface Profile {
  id: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  created_at: string
  is_admin: boolean
  // Set by delete_my_account() when the account is deleted; the row is kept
  // (tombstoned) so posts/comments still render "[Deleted user]".
  deleted_at: string | null
  // Rows created before migration 0010 may lack this key — treat null/undefined
  // as {} when reading.
  social_links: SocialLinks
}

export interface Channel {
  id: string
  slug: string
  name: string
  description: string | null
  position: number
  post_permission: 'all' | 'admin_only'
  created_at: string
}

export interface Post {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  channel_id: string | null
}

export interface PostImage {
  id: string
  post_id: string
  url: string
  storage_path: string
  position: number
  created_at: string | null
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
}

export type PostWithRelations = Post & {
  author: Profile
  images: PostImage[]
  comment_count: number
  likes_count: number
  liked_by_current_user: boolean
}

export type CommentWithRelations = Comment & {
  author: Profile
  likes_count: number
  liked_by_current_user: boolean
}

export type PostWithFullRelations = Post & {
  author: Profile
  images: PostImage[]
  comments: CommentWithRelations[]
  channel: { slug: string } | null
  likes_count: number
  liked_by_current_user: boolean
}

// A single user who liked a post or comment, for the likers modal.
export type Liker = {
  user_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

export type ProfileWithPosts = Profile & {
  posts: Pick<Post, 'id' | 'title' | 'body' | 'created_at' | 'author_id'>[]
}

export type Topic = {
  id: string
  name: string
  description: string | null
  cover_image_url: string | null
  cover_storage_path: string | null
  position: number
  created_at: string | null
  is_locked: boolean
}

export type ContentItem = {
  id: string
  topic_id: string
  type: 'video' | 'document'
  title: string
  description: string | null
  video_url: string | null
  document_url: string | null
  document_storage_path: string | null
  thumbnail_url: string | null
  thumbnail_storage_path: string | null
  position: number
  created_at: string | null
}

export type ContentProgress = {
  user_id: string
  content_item_id: string
  completed_at: string
}

// Classroom Recordings (Stage 1). video_* columns stay null/'pending' until
// Stage 2 wires up Bunny Stream.
export type ClassroomFolder = {
  id: string
  name: string
  parent_folder_id: string | null
  position: number
  created_at: string | null
  created_by: string | null
}

export type ClassroomRecording = {
  id: string
  folder_id: string | null
  title: string
  description: string | null
  position: number
  video_provider: string | null
  video_id: string | null
  video_status: string | null // 'pending' | 'processing' | 'ready' | 'failed'
  video_duration_seconds: number | null
  video_thumbnail_url: string | null
  created_at: string | null
  created_by: string | null
}

export type ClassroomRecordingProgress = {
  user_id: string
  recording_id: string
  completed_at: string
}

// Admin-curated community events (calendar). Named CommunityEvent to avoid
// shadowing the global DOM `Event` type. starts_at/ends_at are UTC timestamptz
// (NOT NULL); display everywhere in Asia/Kuala_Lumpur. See lib/datetime.ts.
export type CommunityEvent = {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  location: string | null
  meeting_url: string | null
  // Non-null links occurrences of a "repeat for N consecutive days" series
  // (one row per KL calendar day). Null = a standalone event. Migration 0009.
  series_id: string | null
  created_by: string | null
  created_at: string | null
}
