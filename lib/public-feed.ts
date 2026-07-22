import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicFeedPost } from '@/lib/types'

// [Surface 4] The homepage public posts feed.
//
// Anon read path: public_posts_feed(p_limit, p_offset, p_teacher_id) — a SECURITY
// DEFINER RPC granted to anon + authenticated (0011). It returns a fixed set of
// display fields (no ids), ordered featured-first then newest, capped at 100/call.
// This module is the SINGLE consumer, shared by the server render (page 0) and the
// client "Load more" (subsequent pages) so the row → view-model mapping cannot drift.
//
// p_teacher_id is null here: the homepage shows the GLOBAL feed across all teachers.

export const PUBLIC_FEED_PAGE_SIZE = 20

// Raw RPC row shape (snake_case, as PostgREST returns it). `image_path` is the
// first post image's storage_path in the post-images bucket (or null); we resolve
// it to a public URL below. `like_count` arrives as a bigint (number-or-string).
type RawFeedRow = {
  author_id: string
  display_name: string
  avatar_url: string | null
  body: string
  image_path: string | null
  like_count: number | string
  teacher_slug: string
  teacher_name: string
  featured: boolean
  created_at: string
}

// Fetch one page of the global public feed. Works with EITHER the server client
// (server component, page 0) or the browser client (client "Load more") — both expose
// .rpc and .storage.getPublicUrl. NEVER throws: on RPC error or no data it returns [],
// so a feed hiccup degrades to an empty/short feed instead of 500-ing the homepage.
// Map one raw RPC row to the view model (resolving the image path to a public URL).
// Exported so the public-profile fetcher reuses the exact same mapping.
export function mapFeedRow(
  supabase: SupabaseClient,
  row: RawFeedRow,
): PublicFeedPost {
  return {
    author_id: row.author_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    body: row.body,
    image_url: row.image_path
      ? supabase.storage.from('post-images').getPublicUrl(row.image_path).data
          .publicUrl
      : null,
    like_count: Number(row.like_count),
    teacher_slug: row.teacher_slug,
    teacher_name: row.teacher_name,
    featured: row.featured,
    created_at: row.created_at,
  }
}

export async function getPublicFeed(
  supabase: SupabaseClient,
  offset = 0,
  limit = PUBLIC_FEED_PAGE_SIZE,
  opts: { teacherId?: string | null; authorId?: string | null } = {},
): Promise<PublicFeedPost[]> {
  const { data, error } = await supabase.rpc('public_posts_feed', {
    p_limit: limit,
    p_offset: offset,
    p_teacher_id: opts.teacherId ?? null,
    p_author_id: opts.authorId ?? null,
  })

  if (error || !data) return []

  return (data as RawFeedRow[]).map((row) => mapFeedRow(supabase, row))
}
