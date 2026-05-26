import { createClient } from '@/lib/supabase/server'
import type {
  Channel,
  Comment,
  Liker,
  PostImage,
  Profile,
  ProfileWithPosts,
  PostWithFullRelations,
  PostWithRelations,
} from '@/lib/types'

// Shapes returned by the Supabase embed queries below. There is no generated
// `Database` type, so we describe the raw responses locally and map them onto
// the public types in `lib/types.ts`.
type LikeRow = { user_id: string }

type FeedRow = {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  channel_id: string | null
  author: Profile | null
  images: PostImage[] | null
  comments: { count: number }[] | null
  likes: LikeRow[] | null
}

type PostRow = {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  channel_id: string | null
  author: Profile | null
  images: PostImage[] | null
  comments:
    | (Comment & { author: Profile | null; likes: LikeRow[] | null })[]
    | null
  channel: { slug: string } | null
  likes: LikeRow[] | null
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

export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .order('position', { ascending: true })

  if (error) {
    throw new Error(`Failed to load channels: ${error.message}`)
  }

  return (data ?? []) as Channel[]
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

  const { data, error } = await supabase
    .from('posts')
    .select(
      '*, author:profiles!author_id(*), images:post_images(*), comments(count), likes:post_likes(user_id)',
    )
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'post_images', ascending: true })

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
        channel_id: row.channel_id,
        author: row.author,
        images: row.images ?? [],
        comment_count: row.comments?.[0]?.count ?? 0,
        likes_count: likes.length,
        liked_by_current_user: !!uid && likes.some((l) => l.user_id === uid),
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

  const { data, error } = await supabase
    .from('posts')
    .select(
      '*, author:profiles!author_id(*), images:post_images(*), comments(*, author:profiles!author_id(*), likes:comment_likes(user_id)), channel:channels(slug), likes:post_likes(user_id)',
    )
    .eq('id', id)
    .order('position', { referencedTable: 'post_images', ascending: true })
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
    channel_id: row.channel_id,
    channel: row.channel,
    author: row.author,
    images: row.images ?? [],
    likes_count: postLikes.length,
    liked_by_current_user: !!uid && postLikes.some((l) => l.user_id === uid),
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
