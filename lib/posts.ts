import { createClient } from '@/lib/supabase/server'
import type {
  Comment,
  PostImage,
  Profile,
  ProfileWithPosts,
  PostWithFullRelations,
  PostWithRelations,
} from '@/lib/types'

// Shapes returned by the Supabase embed queries below. There is no generated
// `Database` type, so we describe the raw responses locally and map them onto
// the public types in `lib/types.ts`.
type FeedRow = {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  author: Profile | null
  images: PostImage[] | null
  comments: { count: number }[] | null
}

type PostRow = {
  id: string
  author_id: string
  title: string
  body: string
  created_at: string
  author: Profile | null
  images: PostImage[] | null
  comments: (Comment & { author: Profile | null })[] | null
}

export async function getFeedPosts(): Promise<PostWithRelations[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('posts')
    .select('*, author:profiles(*), images:post_images(*), comments(count)')
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'post_images', ascending: true })

  if (error) {
    throw new Error(`Failed to load feed posts: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as FeedRow[]

  return rows
    .filter((row): row is FeedRow & { author: Profile } => row.author !== null)
    .map((row) => ({
      id: row.id,
      author_id: row.author_id,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
      author: row.author,
      images: row.images ?? [],
      comment_count: row.comments?.[0]?.count ?? 0,
    }))
}

export async function getPost(
  id: string,
): Promise<PostWithFullRelations | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('posts')
    .select(
      '*, author:profiles(*), images:post_images(*), comments(*, author:profiles(*))',
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

  return {
    id: row.id,
    author_id: row.author_id,
    title: row.title,
    body: row.body,
    created_at: row.created_at,
    author: row.author,
    images: row.images ?? [],
    comments: (row.comments ?? [])
      .filter(
        (comment): comment is Comment & { author: Profile } =>
          comment.author !== null,
      )
      .map((comment) => ({
        id: comment.id,
        post_id: comment.post_id,
        author_id: comment.author_id,
        body: comment.body,
        created_at: comment.created_at,
        author: comment.author,
      })),
  }
}

export async function getAllMembers(): Promise<Profile[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
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
