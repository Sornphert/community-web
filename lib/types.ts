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
  // Announcements-page banner (migration 0021). Null → falls back to the global
  // HERO_URL env var, which is what single-tenant deployments use. Before 0021 the
  // env var was the ONLY source, so every MT tenant rendered the same banner.
  hero_url: string | null
  description: string | null
  // Optional outbound marketing link (migration 0015). Shown as the "Visit website"
  // CTA on the /home locked-community modal; anon-readable. null = no button.
  website_url: string | null
  // Platform category (migration 0004; nullable). One category per teacher; managed
  // by SQL/service-role. Grouping the directory by this is a later step.
  category_id: string | null
}

// Platform-controlled reference data for the public directory (migration 0004).
// Public-read (anon + authenticated); no in-app write UI — managed by SQL/service-role.
export interface Category {
  id: string
  slug: string
  name: string
}

// A curated link in the category-grouped homepage newsletter (migration 0005). READ is
// PUBLIC (anon + authenticated). WRITE is admin-only and two-part: an admin of teacher_id
// may write only when category_id equals that teacher's own category_id — so the category
// is IMPLIED by the teacher and set server-side, never client-chosen. created_by → the
// authoring profile ("added by"), nullable (ON DELETE SET NULL). created_at is exposed to
// anon (a display field for the newest-first feed). NO thumbnails/drafts/issue numbers (v1).
export interface NewsletterItem {
  id: string
  teacher_id: string
  category_id: string
  created_by: string | null
  url: string
  headline: string
  blurb: string | null
  created_at: string
}

// A newsletter row with its teacher (attribution) and category (grouping) embedded — the
// shape the public homepage feed consumes. The embeds stay within anon's column grants:
// teachers anon covers (id, slug, name, logo_url, …); categories anon covers (id, slug,
// name). created_by is NOT embedded (attribution is the teacher, not the author), which
// also avoids the profiles PostgREST embed ambiguity — same posture as events.
export type NewsletterItemWithRefs = NewsletterItem & {
  teacher: Pick<Teacher, 'id' | 'slug' | 'name' | 'logo_url'> | null
  category: Category | null
}

export type MembershipRole = 'member' | 'admin'
export type MembershipStatus = 'active' | 'pending' | 'revoked'

// The profile↔teacher join. A row exists only when an admin grants access; role
// and status live here (is_admin is gone from profiles in the MT schema).
export interface Membership {
  id: string
  profile_id: string
  teacher_id: string
  role: MembershipRole
  status: MembershipStatus
  created_at: string | null
  // Attribution for how the membership was requested (migration 0008). Nullable;
  // null = organic / no join link. e.g. 'join_link'.
  source: string | null
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
  // Outbound marketing link (migration 0015) for the locked-community modal CTA.
  website_url: string | null
  member_count: number
}

export interface Channel {
  id: string
  slug: string
  name: string
  description: string | null
  position: number
  post_permission: 'all' | 'admin_only'
  // Discriminator (migration 0014). 'community' = a normal Community channel.
  // 'weekly' is a legacy value from the removed Weekly vertical; the column
  // persists, so getChannels() filters to 'community' and the [channel] routes
  // 404 any stray 'weekly' row so it never renders inside /community.
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
  // [MT] Public-visibility flags (0011) + the UNCONFLATED viewer signals that
  // feed can_edit, re-exposed for the surface 2/3 UI. is_public = author consent;
  // hidden_from_public = admin kill switch; featured = admin prominence.
  is_public: boolean
  hidden_from_public: boolean
  featured: boolean
  viewerIsAdmin: boolean
  isAuthor: boolean
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
  // section feeds the /community post-detail leak-guard: a post whose channel is
  // a stray section='weekly' row is 404'd rather than rendered under /community.
  channel: { slug: string; section: 'community' | 'weekly' } | null
  likes_count: number
  liked_by_current_user: boolean
  // True when the current viewer is the author or an admin — drives edit/delete UI.
  can_edit: boolean
  // [MT] Same visibility + viewer signals as PostWithRelations, kept symmetric so
  // the detail page can adopt the surface 2/3 UI in a later pass (no UI this pass).
  is_public: boolean
  hidden_from_public: boolean
  featured: boolean
  viewerIsAdmin: boolean
  isAuthor: boolean
}

// [Surface 4] One row of the anon-safe public posts feed (public_posts_feed RPC).
// DELIBERATELY carries NO post id / author id / channel id — the RPC whitelists only
// these display fields, so a feed card is a NON-clickable showcase item (there is no
// auth-gated detail to deep-link into). `image_url` is derived in the fetcher from the
// RPC's `image_path` (first post image, or null). `like_count` is the RPC's bigint,
// narrowed to number.
export type PublicFeedPost = {
  post_id: string
  author_id: string
  display_name: string
  avatar_url: string | null
  body: string
  image_url: string | null
  like_count: number
  teacher_slug: string
  teacher_name: string
  featured: boolean
  created_at: string
}

// [Public post] A single public post for /p/[id], from the public_post RPC (0023).
// comment_count is a COUNT only — comment text is never exposed here (members-only).
export type PublicPost = {
  post_id: string
  author_id: string
  display_name: string
  avatar_url: string | null
  title: string | null
  body: string
  image_url: string | null
  like_count: number
  comment_count: number
  teacher_slug: string
  teacher_name: string
  channel_slug: string | null
  featured: boolean
  created_at: string
}

// [Public profile] The header for a public author profile at /u/[teacher]/[id],
// from the public_member_header RPC (0017). Anon-visible; posts are fetched
// separately through public_posts_feed filtered to this author.
export type PublicMemberHeader = {
  display_name: string
  avatar_url: string | null
  bio: string | null
  social_links: Record<string, string>
  role: MembershipRole
  teacher_slug: string
  teacher_name: string
}

// A single user who liked a post or comment, for the likers modal.
export type Liker = {
  user_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

// A user in a follower/following list (platform-wide follow graph, 0024). Same
// shape as Liker: identity + when the follow happened. Tombstoned profiles are
// filtered out at read time, so display_name here is always a real name.
export type FollowUser = {
  user_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

// Follower/following counts + whether the viewer follows this profile — the
// header block on a member profile.
export type FollowState = {
  followers: number
  following: number
  isFollowing: boolean
}

// Minimal global identity for any user (0025 user_card RPC) — what any authenticated
// user may see about someone platform-wide, regardless of shared community. Posts are
// NOT here (they stay community-gated).
export type UserCard = {
  id: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  social_links: SocialLinks
}

// A post in the cross-teacher "Following" feed (0024): a post by someone you follow,
// still only visible if you're a member of its community (posts RLS enforces that).
// Carries the teacher + channel needed to link to the real in-app post.
export type FollowingFeedPost = {
  id: string
  title: string | null
  body: string
  created_at: string
  author_id: string
  display_name: string
  avatar_url: string | null
  teacher_slug: string
  teacher_name: string
  channel_slug: string | null
}

// [MT] A member row in a teacher's directory: their profile decorated with their
// role IN THIS TEACHER (memberships.role) — never the global is_admin, never the
// viewer's role. Drives the per-member "Admin" badge.
export type MemberListItem = Profile & { role: MembershipRole }

// [MT] A pending join request in a teacher's admin queue: the requester's identity
// plus when/how they applied. Distinct from MemberListItem — pending rows carry no
// role of interest (always 'member' until approved) and the queue needs `created_at`
// (FIFO order + "requested Nh ago") and `source` (attribution), which the active
// roster omits.
export type PendingMember = Pick<
  Profile,
  'id' | 'display_name' | 'avatar_url'
> & { created_at: string | null; source: string | null }

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

// In-app notification kinds. Mirror the DB CHECK on notifications.type.
//   mention       — someone @-mentioned you in a post or comment
//   mention_all   — an admin @all'd everyone (you're one of them)
//   post_comment  — someone commented on your post
//   post_like     — someone liked your post
//   comment_like  — someone liked your comment
export type NotificationType =
  | 'mention'
  | 'mention_all'
  | 'post_comment'
  | 'post_like'
  | 'comment_like'

// A notification row decorated for display: the actor's identity plus enough of
// the target (post title, channel slug) to build a deep link. Rows are created
// only by DB triggers (0013); the client never inserts them.
export type NotificationItem = {
  id: string
  type: NotificationType
  read_at: string | null
  created_at: string
  post_id: string | null
  comment_id: string | null
  // Denormalized for the dropdown link + snippet.
  post_title: string | null
  channel_slug: string | null
  actor: {
    id: string
    display_name: string
    avatar_url: string | null
  } | null
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

// Classroom tier tags (migration 0006). Per-teacher labels that gate Topics: a member
// sees a gated topic's content_items only if the topic has no required tags OR the member
// holds >=1 of them (enforced in RLS via can_access_topic). teacher_id is a scoping column
// (omitted here, matching Topic/ContentItem — fetchers filter by it).
export type Tag = {
  id: string
  name: string
  color: string | null
  created_at: string | null
}

// Join: a topic REQUIRES a tag. A topic with no TopicTag rows is ungated (open to all).
export type TopicTag = {
  topic_id: string
  tag_id: string
  created_at: string | null
}

// Join: a member HOLDS a tag. Same-teacher integrity is enforced structurally by composite
// FKs (a teacher-A tag can only be assigned to a member of A).
export type MemberTag = {
  profile_id: string
  tag_id: string
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
