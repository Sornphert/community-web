import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isTeacherAdmin } from '@/lib/auth'
import {
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  POST_ATTACHMENTS_BUCKET,
  attachmentPathFrom,
} from '@/lib/attachments'
import type {
  Channel,
  Comment,
  Liker,
  PostAttachment,
  PostImage,
  PostVideo,
  Profile,
  MembershipRole,
  MemberListItem,
  PendingMember,
  MemberWithPosts,
  PostWithFullRelations,
  PostWithRelations,
} from '@/lib/types'

// Shapes returned by the Supabase embed queries below. There is no generated
// `Database` type, so we describe the raw responses locally and map them onto
// the public types in `lib/types.ts`.
type LikeRow = { user_id: string }

// post_videos has a UNIQUE(post_id), so PostgREST returns the embed as a single
// object (or null). Accept an array too, defensively, and normalize via
// firstVideo() below.
type VideoEmbed = PostVideo | PostVideo[] | null

function firstVideo(v: VideoEmbed | undefined): PostVideo | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type FeedRow = {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  edited_at: string | null
  channel_id: string | null
  is_public: boolean
  hidden_from_public: boolean
  featured: boolean
  author: Profile | null
  images: PostImage[] | null
  attachments: PostAttachment[] | null
  video: VideoEmbed
  comments: { count: number }[] | null
  likes: LikeRow[] | null
}

type PostRow = {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  edited_at: string | null
  channel_id: string | null
  is_public: boolean
  hidden_from_public: boolean
  featured: boolean
  author: Profile | null
  images: PostImage[] | null
  attachments: PostAttachment[] | null
  video: VideoEmbed
  comments:
    | (Comment & { author: Profile | null; likes: LikeRow[] | null })[]
    | null
  channel: { slug: string; section: 'community' | 'weekly' } | null
  likes: LikeRow[] | null
}

// Embedded shape returned by the likers queries below.
type LikerRow = { created_at: string; user: Profile | null }

// Community channels for ONE teacher, position-ordered. The scoped, isolation-safe
// path: the /t/[slug] shell and every ported Community route pass teacher_id, so a
// member only ever sees their own teacher's channels.
//
// LEAK-GUARD: only Community channels (section='community'). Weekly channels must
// never appear in the Community sidebar / mobile tabs / migrate-posts list.
export async function getChannels(teacherId: string): Promise<Channel[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('section', 'community')
    .order('position', { ascending: true })

  if (error) {
    throw new Error(`Failed to load channels: ${error.message}`)
  }

  return (data ?? []) as Channel[]
}

// Per-channel post counts for ONE teacher's community channels, as a
// { [channelId]: count } map. Powers the admin delete-UX only ("has N posts, move or
// delete first") — it is NOT the authorization guard: DELETE is blocked at the DB by the
// posts→channels FK (NO ACTION → 23503), so a stale count can never let an unsafe delete
// through. Same section='community' hard-scope as getChannels.
export async function getChannelPostCounts(
  teacherId: string,
): Promise<Record<string, number>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('channels')
    .select('id, posts(count)')
    .eq('teacher_id', teacherId)
    .eq('section', 'community')

  if (error) {
    throw new Error(`Failed to load channel post counts: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as {
    id: string
    posts: { count: number }[] | null
  }[]

  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.id] = row.posts?.[0]?.count ?? 0
  }
  return counts
}

// Scoped: a teacher's channel by slug. slug is unique PER TEACHER, so teacher_id
// is required to disambiguate (without it, a multi-membership viewer matching the
// same slug across teachers would make .maybeSingle() throw).
export async function getChannelBySlug(
  slug: string,
  teacherId: string,
): Promise<Channel | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load channel: ${error.message}`)
  }

  return (data as Channel | null) ?? null
}

export async function getPostsForChannel(
  channelId: string,
  teacherId: string,
): Promise<PostWithRelations[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id ?? null
  // [MT] Edit/delete affordance = author OR admin OF THIS TEACHER. Resolved via the
  // same is_teacher_admin RPC the posts *_admin RLS policies use — never a global
  // is_admin (that column is gone under MT).
  const viewerIsAdmin = await isTeacherAdmin(teacherId)

  const { data, error } = await supabase
    .from('posts')
    .select(
      '*, author:profiles!author_id(*), images:post_images(*), attachments:post_attachments(*), video:post_videos(*), comments(count), likes:post_likes(user_id)',
    )
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'post_images', ascending: true })
    .order('position', { referencedTable: 'post_attachments', ascending: true })

  if (error) {
    throw new Error(`Failed to load channel posts: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as FeedRow[]

  return rows
    .filter((row): row is FeedRow & { author: Profile } => row.author !== null)
    .map((row) => {
      const likes = row.likes ?? []
      return {
        id: row.id,
        author_id: row.author_id,
        title: row.title,
        body: row.body,
        created_at: row.created_at,
        edited_at: row.edited_at,
        channel_id: row.channel_id,
        author: row.author,
        images: row.images ?? [],
        attachments: row.attachments ?? [],
        video: firstVideo(row.video),
        comment_count: row.comments?.[0]?.count ?? 0,
        likes_count: likes.length,
        liked_by_current_user: !!uid && likes.some((l) => l.user_id === uid),
        can_edit: viewerIsAdmin || (!!uid && row.author_id === uid),
        is_public: row.is_public,
        hidden_from_public: row.hidden_from_public,
        featured: row.featured,
        viewerIsAdmin: viewerIsAdmin,
        isAuthor: !!uid && row.author_id === uid,
      }
    })
}

// [0020] Re-mint attachment urls as short-lived signed urls (the bucket is private).
// Batched into one createSignedUrls call. A signing failure degrades to the original
// value rather than throwing — a dead download link must not 500 the post page.
async function signAttachments(
  supabase: SupabaseClient,
  attachments: PostAttachment[],
): Promise<PostAttachment[]> {
  if (attachments.length === 0) return attachments

  const paths = attachments
    .map((a) => attachmentPathFrom(a.storage_path, a.url))
    .filter((p): p is string => !!p)
  if (paths.length === 0) return attachments

  const { data } = await supabase.storage
    .from(POST_ATTACHMENTS_BUCKET)
    .createSignedUrls([...new Set(paths)], ATTACHMENT_SIGNED_URL_TTL_SECONDS)

  const signed = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl)
  }

  return attachments.map((a) => {
    const path = attachmentPathFrom(a.storage_path, a.url)
    return path ? { ...a, url: signed.get(path) ?? a.url } : a
  })
}

export async function getPost(
  id: string,
  teacherId: string,
): Promise<PostWithFullRelations | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id ?? null
  // [MT] Author OR admin OF THIS TEACHER — same is_teacher_admin RPC as RLS.
  const viewerIsAdmin = await isTeacherAdmin(teacherId)

  const { data, error } = await supabase
    .from('posts')
    .select(
      '*, author:profiles!author_id(*), images:post_images(*), attachments:post_attachments(*), video:post_videos(*), comments(*, author:profiles!author_id(*), likes:comment_likes(user_id)), channel:channels(slug, section), likes:post_likes(user_id)',
    )
    .eq('id', id)
    // [MT] Tenant guard: a post is only reachable under its OWN teacher's shell. Without
    // this, a dual-member (admin of A, member of B) could load a B-post under /t/A and it
    // would carry viewerIsAdmin=isTeacherAdmin(A)=true — a spoofed cross-tenant moderation
    // affordance. Mismatched teacher => maybeSingle() returns null => caller 404s.
    .eq('teacher_id', teacherId)
    .order('position', { referencedTable: 'post_images', ascending: true })
    .order('position', { referencedTable: 'post_attachments', ascending: true })
    .order('created_at', { referencedTable: 'comments', ascending: true })
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load post: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const row = data as unknown as PostRow

  if (!row.author) {
    return null
  }

  const postLikes = row.likes ?? []

  // [0020] post-attachments is PRIVATE, so the stored /object/public/... urls are
  // dead. Mint short-lived signed urls here — this is the ONLY fetcher that needs it,
  // because post CARDS render just a count while post-detail and the edit form render
  // attachment.url, and both read through getPost. Signing runs on the USER's client
  // so the storage SELECT policy (active member of the owning teacher) enforces.
  const attachments = await signAttachments(supabase, row.attachments ?? [])

  return {
    id: row.id,
    author_id: row.author_id,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    edited_at: row.edited_at,
    channel_id: row.channel_id,
    channel: row.channel,
    author: row.author,
    images: row.images ?? [],
    attachments,
    video: firstVideo(row.video),
    likes_count: postLikes.length,
    liked_by_current_user: !!uid && postLikes.some((l) => l.user_id === uid),
    can_edit: viewerIsAdmin || (!!uid && row.author_id === uid),
    is_public: row.is_public,
    hidden_from_public: row.hidden_from_public,
    featured: row.featured,
    viewerIsAdmin: viewerIsAdmin,
    isAuthor: !!uid && row.author_id === uid,
    comments: (row.comments ?? [])
      .filter(
        (
          comment,
        ): comment is Comment & {
          author: Profile
          likes: LikeRow[] | null
        } => comment.author !== null,
      )
      .map((comment) => {
        const commentLikes = comment.likes ?? []
        return {
          id: comment.id,
          post_id: comment.post_id,
          author_id: comment.author_id,
          body: comment.body,
          created_at: comment.created_at,
          author: comment.author,
          likes_count: commentLikes.length,
          liked_by_current_user:
            !!uid && commentLikes.some((l) => l.user_id === uid),
        }
      }),
  }
}

// [MT] A teacher's member directory. Driven FROM memberships (not profiles): the
// roster is exactly the profiles holding an ACTIVE membership in THIS teacher.
// teacherId is REQUIRED — `memberships_select_self_or_comember` RLS lets a member
// read co-members' rows for teachers they share, so an un-scoped query would NOT
// error; it would return co-members across every teacher the viewer belongs to.
// `.eq('teacher_id', teacherId)` is the real tenant boundary, and
// `.eq('status', 'active')` is the real revoked-exclusion (revoked rows ARE visible
// to members). Tombstoned profiles (deleted_at) are dropped client-side.
export async function getAllMembers(
  teacherId: string,
): Promise<MemberListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('memberships')
    .select('role, profile:profiles!profile_id(*)')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')

  if (error) {
    throw new Error(`Failed to load members: ${error.message}`)
  }

  type Row = { role: MembershipRole; profile: Profile | null }

  return ((data ?? []) as unknown as Row[])
    .filter(
      (row): row is Row & { profile: Profile } =>
        row.profile !== null && row.profile.deleted_at === null,
    )
    .map((row) => ({ ...row.profile, role: row.role }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
}

// [MT] The admin pending-join queue for THIS teacher. Same memberships-driven shape as
// getAllMembers (same `profile:profiles!profile_id(*)` FK-hinted embed), differing only in
// the status filter (`pending`) and by also selecting `created_at`/`source` for the queue
// UI. teacherId is REQUIRED — policy #4's admin-branch (`is_teacher_admin(teacher_id)`, 0008)
// is what makes pending rows readable at all (co-members can't see them post-0008), and
// `.eq('teacher_id', teacherId)` is the tenant boundary. Ordered created_at ASC (oldest
// first = FIFO queue). Tombstoned profiles (deleted_at) dropped client-side, mirroring
// getAllMembers.
export async function getPendingMembers(
  teacherId: string,
): Promise<PendingMember[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('memberships')
    .select('created_at, source, profile:profiles!profile_id(*)')
    .eq('teacher_id', teacherId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to load pending members: ${error.message}`)
  }

  type Row = {
    created_at: string | null
    source: string | null
    profile: Profile | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter(
      (row): row is Row & { profile: Profile } =>
        row.profile !== null && row.profile.deleted_at === null,
    )
    .map((row) => ({
      id: row.profile.id,
      display_name: row.profile.display_name,
      avatar_url: row.profile.avatar_url,
      created_at: row.created_at,
      source: row.source,
    }))
}

// [MT] A single member's profile within THIS teacher's directory. Returns null
// unless the target holds an ACTIVE membership in teacherId — so members of other
// teachers (or revoked/tombstoned ones) are not viewable here. Their posts are
// scoped to teacherId (posts.teacher_id is NOT NULL); the channel slug is embedded
// to build the post URL (null channel = unassigned → rendered non-clickable).
export async function getMemberProfile(
  id: string,
  teacherId: string,
): Promise<MemberWithPosts | null> {
  const supabase = await createClient()

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role, profile:profiles!profile_id(*)')
    .eq('profile_id', id)
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    throw new Error(`Failed to load member: ${membershipError.message}`)
  }

  const profile = (membership as { profile: Profile | null } | null)?.profile
  if (!membership || !profile || profile.deleted_at !== null) {
    return null
  }

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, title, body, created_at, author_id, channel:channels(slug)')
    .eq('author_id', id)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })

  if (postsError) {
    throw new Error(`Failed to load member posts: ${postsError.message}`)
  }

  type PostRow = {
    id: string
    title: string | null
    body: string
    created_at: string
    author_id: string
    channel: { slug: string } | null
  }

  return {
    ...profile,
    role: (membership as { role: MembershipRole }).role,
    posts: ((posts ?? []) as unknown as PostRow[]).map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      created_at: p.created_at,
      author_id: p.author_id,
      channel_slug: p.channel?.slug ?? null,
    })),
  }
}

// A post in the GLOBAL profile view — spans every teacher the user is a member of,
// each carrying its own teacher_slug so the row can link into the right shell.
export type GlobalProfilePost = {
  id: string
  title: string | null
  body: string
  created_at: string
  teacher_slug: string
  channel_slug: string | null
}

// Posts authored by `userId` that the CURRENT viewer may see, across every teacher,
// newest first. RLS scopes results to communities the viewer is a member of, so on a
// global profile you see someone's posts only in communities you share. Used by the
// global /profile and the universal /people/[id] profile.
export async function getPostsByAuthor(
  userId: string,
): Promise<GlobalProfilePost[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, title, body, created_at, teacher:teachers!teacher_id(slug), channel:channels(slug)',
    )
    .eq('author_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load profile posts: ${error.message}`)
  }

  type Row = {
    id: string
    title: string | null
    body: string
    created_at: string
    teacher: { slug: string } | null
    channel: { slug: string } | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.teacher !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      created_at: r.created_at,
      teacher_slug: r.teacher!.slug,
      channel_slug: r.channel?.slug ?? null,
    }))
}

function mapLikers(rows: LikerRow[]): Liker[] {
  return rows
    .filter((row): row is LikerRow & { user: Profile } => row.user !== null)
    .map((row) => ({
      user_id: row.user.id,
      display_name: row.user.display_name,
      avatar_url: row.user.avatar_url,
      created_at: row.created_at,
    }))
}

export async function getPostLikers(postId: string): Promise<Liker[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('post_likes')
    .select('created_at, user:profiles!user_id(*)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load post likers: ${error.message}`)
  }

  return mapLikers((data ?? []) as unknown as LikerRow[])
}

export async function getCommentLikers(commentId: string): Promise<Liker[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('comment_likes')
    .select('created_at, user:profiles!user_id(*)')
    .eq('comment_id', commentId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load comment likers: ${error.message}`)
  }

  return mapLikers((data ?? []) as unknown as LikerRow[])
}
