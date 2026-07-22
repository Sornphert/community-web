import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicFeedPost, PublicMemberHeader } from '@/lib/types'
import { getPublicFeed, PUBLIC_FEED_PAGE_SIZE } from '@/lib/public-feed'

// [Public profile] Data for /u/[teacher]/[id]. Both reads go through anon-granted
// SECURITY DEFINER RPCs (0017), so this works logged-out and cannot reach anything
// private: the header requires an ACTIVE, non-tombstoned membership, and the posts
// are the SAME public-only set the homepage feed exposes (is_public AND NOT
// hidden_from_public), just filtered to one author + teacher.

// Resolve (teacherSlug, authorId) → the profile header, or null (→ 404). We take the
// teacher by SLUG (from the URL) and translate to its id for the header RPC.
export async function getPublicMemberHeader(
  supabase: SupabaseClient,
  teacherSlug: string,
  authorId: string,
): Promise<{ header: PublicMemberHeader; teacherId: string } | null> {
  const { data: teacher, error: tErr } = await supabase
    .from('teachers')
    .select('id')
    .eq('slug', teacherSlug)
    .maybeSingle()
  if (tErr || !teacher) return null

  const teacherId = (teacher as { id: string }).id

  const { data, error } = await supabase.rpc('public_member_header', {
    p_teacher_id: teacherId,
    p_author_id: authorId,
  })
  if (error || !data || (data as unknown[]).length === 0) return null

  const row = (data as PublicMemberHeader[])[0]
  return { header: row, teacherId }
}

// One page of the author's PUBLIC posts within this teacher. Delegates to the shared
// feed fetcher with both filters set, so the public-post predicate stays single-source.
export async function getPublicMemberPosts(
  supabase: SupabaseClient,
  teacherId: string,
  authorId: string,
  offset = 0,
  limit = PUBLIC_FEED_PAGE_SIZE,
): Promise<PublicFeedPost[]> {
  return getPublicFeed(supabase, offset, limit, { teacherId, authorId })
}
