import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicFeedPost } from '@/lib/types'

// [Surface 4] The homepage public posts feed.
//
// Anon read path: public_posts_feed(p_limit, p_offset, p_teacher_id, p_author_id) —
// a SECURITY DEFINER RPC granted to anon + authenticated (0011; author filter 0017).
// It returns a fixed set of display fields, ordered featured-first then newest,
// capped at 100/call. This module is the SINGLE consumer, shared by the server render
// (page 0), the client "Load more", and the public profile page, so the row →
// view-model mapping cannot drift.
//
// Both filters default to null: the homepage shows the GLOBAL feed across all
// teachers and authors.

export const PUBLIC_FEED_PAGE_SIZE = 20

// Raw RPC row shape (snake_case, as PostgREST returns it). `image_url` is the first
// post image's ABSOLUTE public URL (or null) — already resolved server-side (0018),
// so no client-side URL building. `like_count` arrives as a bigint (number-or-string).
type RawFeedRow = {
  post_id: string
  author_id: string
  display_name: string
  avatar_url: string | null
  body: string
  image_url: string | null
  like_count: number | string
  teacher_slug: string
  teacher_name: string
  featured: boolean
  created_at: string
}

// Map one raw RPC row to the view model. Exported so the public-profile fetcher
// reuses the exact same mapping.
//
// image_url arrives ABSOLUTE from the RPC (0018) — we do NOT rebuild it with
// getPublicUrl. post_images.url is the authoritative address and is set by every
// writer; rebuilding from storage_path assumed the bytes live in THIS project's
// bucket, which broke for content imported from the single-tenant projects.
export function mapFeedRow(row: RawFeedRow): PublicFeedPost {
  return {
    post_id: row.post_id,
    author_id: row.author_id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    body: row.body,
    image_url: row.image_url,
    like_count: Number(row.like_count),
    teacher_slug: row.teacher_slug,
    teacher_name: row.teacher_name,
    featured: row.featured,
    created_at: row.created_at,
  }
}

// Fetch one page. Works with EITHER the server client (server component, page 0) or
// the browser client (client "Load more") — both expose .rpc. NEVER throws: on RPC
// error or no data it returns [], so a feed hiccup degrades to an empty/short feed
// instead of 500-ing the homepage.
export async function getPublicFeed(
  supabase: SupabaseClient,
  offset = 0,
  limit = PUBLIC_FEED_PAGE_SIZE,
  opts: {
    teacherId?: string | null
    authorId?: string | null
    categorySlug?: string | null
  } = {},
): Promise<PublicFeedPost[]> {
  const { data, error } = await supabase.rpc('public_posts_feed', {
    p_limit: limit,
    p_offset: offset,
    p_teacher_id: opts.teacherId ?? null,
    p_author_id: opts.authorId ?? null,
    p_category_slug: opts.categorySlug ?? null,
  })

  if (error || !data) return []

  return (data as RawFeedRow[]).map(mapFeedRow)
}

export type FeedCategory = { slug: string; name: string }

// Categories that have at least one PUBLIC post, for the homepage feed chips. Reads via
// the public_feed_categories() SECURITY DEFINER RPC (anon-granted) — a direct posts
// query is blocked by RLS for logged-out visitors, same reason the feed uses an RPC.
// Never throws: on error returns [] so the feed just renders without chips.
export async function getPublicFeedCategories(
  supabase: SupabaseClient,
): Promise<FeedCategory[]> {
  const { data, error } = await supabase.rpc('public_feed_categories')
  if (error || !data) return []
  return (data as FeedCategory[]).map((c) => ({ slug: c.slug, name: c.name }))
}
