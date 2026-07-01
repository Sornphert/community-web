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
  // Set by delete_my_account() when the account is deleted; the row is kept
  // (tombstoned) so posts/comments still render "[Deleted user]".
  deleted_at: string | null
  // Rows created before migration 0010 may lack this key — treat null/undefined
  // as {} when reading.
  social_links: SocialLinks
}

// A tenant in the multi-tenant build (one teacher = one community). The teacher
// directory is openly readable by any authenticated user (teachers_select_all RLS);
// all CONTENT remains gated by membership. NO branding column yet — card colors are
// derived deterministically from `slug` in the UI (see home/_components/teacher-card).
export interface Teacher {
  id: string
  slug: string
  name: string
  created_at: string | null
  // Per-teacher branding for the /home directory cards (migration 0002). All
  // nullable for now; the directory step picks a fallback on explicit null.
  cover_url: string | null
  logo_url: string | null
  description: string | null
}

export type MembershipRole = 'member' | 'admin'
export type MembershipStatus = 'active' | 'revoked'

// The profile↔teacher join. A row exists only when an admin grants access; role
// and status live here (is_admin is gone from profiles in the MT schema).
export interface Membership {
  id: string
  profile_id: string
  teacher_id: string
  role: MembershipRole
  status: MembershipStatus
  created_at: string | null
}

// A teacher the current user actively belongs to, decorated with their role in it
// — the shape the /home "Your communities" cards consume.
export type TeacherWithRole = Teacher & { role: MembershipRole }

// The directory-card shape: the anon-safe column subset (NO created_at — anon has
// no grant on it) plus the RPC-sourced active-member count. Kept distinct from
// Teacher (which carries created_at and is selected in full inside /t/[slug]).
export type DirectoryTeacher = {
  id: string
  slug: string
  name: string
  cover_url: string | null
  logo_url: string | null
  description: string | null
  member_count: number
}

export interface Channel {
  id: string
  slug: string
  name: string
  description: string | null
  position: number
  post_permission: 'all' | 'admin_only'
  // Discriminator (migration 0014). 'community' = a normal Community channel;
  // 'weekly' = a "Johnson Weekly 市场报告" week folder. Existing rows default to
  // 'community'. getChannels() filters to 'community'; the weekly fetchers to
  // 'weekly'.
  section: 'community' | 'weekly'
  // Weekly channels only: the PER-MONTH sort key (restarts at 1 in each month,
  // ordered DESC = newest week on top). null for community channels. Independent
  // of `slug`, which is a global unique id ('week-N' where N is a global seed).
  week_number: number | null
  // Weekly channels only: the month (week_groups row) this week belongs to.
  // Enforced non-null for weekly by the channels_weekly_has_group CHECK; null
  // for community channels.
  group_id: string | null
  created_at: string
}

export interface Post {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  channel_id: string | null
  // Set by the updatePost action. null = never edited (drives the "(edited)" tag).
  edited_at: string | null
}

export interface PostImage {
  id: string
  post_id: string
  url: string
  storage_path: string
  position: number
  created_at: string | null
}

// A PDF file attached to a post. Mirrors PostImage, plus file_name / file_size
// for rendering the attachment card. storage_path: {user_id}/{post_id}/{pos}.pdf
export interface PostAttachment {
  id: string
  post_id: string
  url: string
  storage_path: string
  file_name: string
  file_size: number
  position: number
  created_at: string | null
}

// An optional Bunny Stream video attached to a post (one per post, admin-only).
// Mirrors the video_* columns on ClassroomRecording. Absent for posts with no
// video — the post then renders exactly as before.
export interface PostVideo {
  id: string
  post_id: string
  video_provider: string | null
  video_id: string | null
  video_status: string | null // 'pending' | 'processing' | 'ready' | 'failed'
  video_duration_seconds: number | null
  video_thumbnail_url: string | null
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
  attachments: PostAttachment[]
  video: PostVideo | null
  comment_count: number
  likes_count: number
  liked_by_current_user: boolean
  // True when the current viewer is the author or an admin — drives edit/delete UI.
  can_edit: boolean
}

export type CommentWithRelations = Comment & {
  author: Profile
  likes_count: number
  liked_by_current_user: boolean
}

export type PostWithFullRelations = Post & {
  author: Profile
  images: PostImage[]
  attachments: PostAttachment[]
  video: PostVideo | null
  comments: CommentWithRelations[]
  // section drives the /community post-detail collision guard: a weekly post is
  // redirected to its canonical /weekly URL.
  channel: { slug: string; section: 'community' | 'weekly' } | null
  likes_count: number
  liked_by_current_user: boolean
  // True when the current viewer is the author or an admin — drives edit/delete UI.
  can_edit: boolean
}

// A single user who liked a post or comment, for the likers modal.
export type Liker = {
  user_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

// [MT] A member row in a teacher's directory: their profile decorated with their
// role IN THIS TEACHER (memberships.role) — never the global is_admin, never the
// viewer's role. Drives the per-member "Admin" badge.
export type MemberListItem = Profile & { role: MembershipRole }

// A member's post as shown on their profile. `channel_slug` is the post's channel
// (null = unassigned) — needed to build the MT post URL /t/{slug}/community/{channel}/{id}.
// `title` is nullable in the DB (posts.title is `text` nullable), so it is widened
// here rather than taken from Post (whose `title` is typed non-null).
export type MemberPost = Pick<
  Post,
  'id' | 'body' | 'created_at' | 'author_id'
> & { title: string | null; channel_slug: string | null }

// [MT] Member detail: profile + role-in-this-teacher + their posts SCOPED to this teacher.
export type MemberWithPosts = Profile & {
  role: MembershipRole
  posts: MemberPost[]
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
  // [MT] Replaces the single-tenant hardcoded "Recordings" topic UUID. Exactly one
  // topic per teacher carries is_recordings=true (enforced by the partial unique
  // index topics_one_recordings_per_teacher_idx). The classroom landing special-cases
  // this row to link to the Recordings tree instead of the generic topic view.
  is_recordings: boolean
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
  // [MT] Owning teacher; events.teacher_id is NOT NULL and RLS-gated by
  // has_membership(teacher_id). Stamped on insert (single + every series row).
  teacher_id: string
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
