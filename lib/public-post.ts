import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicPost } from '@/lib/types'

// [Public post] Single public post for /p/[id], via the anon-granted public_post RPC
// (0023). Same public gate as the feed — a private post returns null even by id, so
// there's no leak. comment_count is a number only; comment text stays members-only.
// Never throws: on error/no row returns null so the page 404s cleanly.
export async function getPublicPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<PublicPost | null> {
  const { data, error } = await supabase.rpc('public_post', {
    p_post_id: postId,
  })
  if (error || !data || (data as unknown[]).length === 0) return null

  const row = (data as Record<string, unknown>[])[0]
  return {
    post_id: row.post_id as string,
    author_id: row.author_id as string,
    display_name: row.display_name as string,
    avatar_url: (row.avatar_url as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    body: row.body as string,
    image_url: (row.image_url as string | null) ?? null,
    like_count: Number(row.like_count),
    comment_count: Number(row.comment_count),
    teacher_slug: row.teacher_slug as string,
    teacher_name: row.teacher_name as string,
    channel_slug: (row.channel_slug as string | null) ?? null,
    featured: Boolean(row.featured),
    created_at: row.created_at as string,
  }
}
