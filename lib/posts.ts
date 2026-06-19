import { createClient } from '@/lib/supabase/server'
import type {
  Channel,
  Comment,
  Liker,
  PostAttachment,
  PostImage,
  PostVideo,
  Profile,
  ProfileWithPosts,
  PostWithFullRelations,
  PostWithRelations,
  WeekFolder,
  WeekGroup,
  MonthFolder,
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

// Whether the current viewer may edit/delete a post: the author, or any admin.
// Fetched once per request and combined with each post's author_id.
async function getViewerIsAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uid: string | null,
): Promise<boolean> {
  if (!uid) return false
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', uid)
    .maybeSingle()
  return data?.is_admin === true
}

// Embedded shape returned by the likers queries below.
type LikerRow = { created_at: string; user: Profile | null }

// A post awaiting channel assignment in the one-time /admin/migrate-posts UI.
export type UnassignedPost = {
  id: string
  title: string
  body: string
  created_at: string
  author: Profile | null
}

// Community channels for ONE teacher, position-ordered. The scoped, isolation-safe
// path: the /t/[slug] shell and every ported Community route pass teacher_id, so a
// member only ever sees their own teacher's channels.
//
// LEAK-GUARD: only Community channels (section='community'). Weekly channels must
// never appear in the Community sidebar / mobile tabs / migrate-posts list — their
// canonical home is the /weekly tree (see getMonths / getWeeksForMonth).
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

// DELIBERATELY UN-SCOPED — returns Community channels across EVERY teacher the viewer
// belongs to (under MT RLS). The ugly name is the whole point: this is the ONLY
// un-scoped channels path, so it is callable only on purpose and is trivially
// greppable for the Step 4 sweep. It exists solely for the not-yet-ported
// single-tenant (app) callers ((app)/layout.tsx, (app)/admin/migrate-posts,
// (app)/community/[channel]). DELETE it when those routes are removed in the
// per-vertical port. NEVER call it from a /t/[slug] route.
export async function getChannelsLegacyUnscoped(): Promise<Channel[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('section', 'community')
    .order('position', { ascending: true })

  if (error) {
    throw new Error(`Failed to load channels: ${error.message}`)
  }

  return (data ?? []) as Channel[]
}

// "Months" for the /weekly hub: week_groups newest-first, each with its week
// count. Only weekly channels carry a group_id, so the embedded channels(count)
// is exactly the month's week count.
export async function getMonths(): Promise<MonthFolder[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('week_groups')
    .select('*, channels(count)')
    .order('position', { ascending: false })

  if (error) {
    throw new Error(`Failed to load months: ${error.message}`)
  }

  type MonthRow = WeekGroup & { channels: { count: number }[] | null }

  return ((data ?? []) as unknown as MonthRow[]).map((row) => {
    const { channels, ...group } = row
    return { ...group, week_count: channels?.[0]?.count ?? 0 }
  })
}

// A single month (for the month page header). null if the id is unknown.
export async function getWeekGroup(id: string): Promise<WeekGroup | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('week_groups')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load month: ${error.message}`)
  }

  return (data as WeekGroup | null) ?? null
}

// The weeks inside one month, newest week first, each with its post count, plus
// the month itself (for the page header). Returns null when the month id is
// unknown so the page can 404.
export async function getWeeksForMonth(
  groupId: string,
): Promise<{ group: WeekGroup; weeks: WeekFolder[] } | null> {
  const supabase = await createClient()

  const group = await getWeekGroup(groupId)
  if (!group) {
    return null
  }

  const { data, error } = await supabase
    .from('channels')
    .select('*, posts(count)')
    .eq('section', 'weekly')
    .eq('group_id', groupId)
    .order('week_number', { ascending: false })

  if (error) {
    throw new Error(`Failed to load weeks: ${error.message}`)
  }

  type WeekRow = Channel & { posts: { count: number }[] | null }

  const weeks = ((data ?? []) as unknown as WeekRow[]).map((row) => {
    const { posts, ...channel } = row
    return { ...channel, post_count: posts?.[0]?.count ?? 0 }
  })

  return { group, weeks }
}

export async function getChannelBySlug(slug: string): Promise<Channel | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load channel: ${error.message}`)
  }

  return (data as Channel | null) ?? null
}

export async function getPostsForChannel(
  channelId: string,
): Promise<PostWithRelations[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id ?? null
  const viewerIsAdmin = await getViewerIsAdmin(supabase, uid)

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
      }
    })
}

export async function getUnassignedPosts(): Promise<UnassignedPost[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('posts')
    .select('id, title, body, created_at, author:profiles!author_id(*)')
    .is('channel_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load unassigned posts: ${error.message}`)
  }

  return (data ?? []) as unknown as UnassignedPost[]
}

export async function getPost(
  id: string,
): Promise<PostWithFullRelations | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id ?? null
  const viewerIsAdmin = await getViewerIsAdmin(supabase, uid)

  const { data, error } = await supabase
    .from('posts')
    .select(
      '*, author:profiles!author_id(*), images:post_images(*), attachments:post_attachments(*), video:post_videos(*), comments(*, author:profiles!author_id(*), likes:comment_likes(user_id)), channel:channels(slug, section), likes:post_likes(user_id)',
    )
    .eq('id', id)
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
    attachments: row.attachments ?? [],
    video: firstVideo(row.video),
    likes_count: postLikes.length,
    liked_by_current_user: !!uid && postLikes.some((l) => l.user_id === uid),
    can_edit: viewerIsAdmin || (!!uid && row.author_id === uid),
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

export async function getAllMembers(): Promise<Profile[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .is('deleted_at', null)
    .order('display_name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load members: ${error.message}`)
  }

  return (data ?? []) as Profile[]
}

export async function getMemberProfile(
  id: string,
): Promise<ProfileWithPosts | null> {
  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Failed to load member: ${profileError.message}`)
  }

  if (!profile) {
    return null
  }

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, title, body, created_at, author_id')
    .eq('author_id', id)
    .order('created_at', { ascending: false })

  if (postsError) {
    throw new Error(`Failed to load member posts: ${postsError.message}`)
  }

  return {
    ...(profile as Profile),
    posts: (posts ?? []) as ProfileWithPosts['posts'],
  }
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
