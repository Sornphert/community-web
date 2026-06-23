import { createClient } from '@/lib/supabase/server'
import type { ContentItem, Topic } from '@/lib/types'

// [MT] Every fetcher takes a REQUIRED teacherId and filters teacher_id. Under MT RLS
// a spine read is gated by has_membership(teacher_id), so an un-scoped read does NOT
// error — it returns rows for EVERY teacher the viewer belongs to. The .eq filters
// here are therefore the only thing preventing cross-tenant bleed for a dual-member.

export async function getTopics(teacherId: string): Promise<Topic[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load topics: ${error.message}`)
  }

  return (data ?? []) as Topic[]
}

export async function getTopic(
  id: string,
  teacherId: string,
): Promise<Topic | null> {
  const supabase = await createClient()

  // LOAD-BEARING: a dual-member passes has_membership for both teachers, so RLS would
  // permit reading another teacher's topic by id. The teacher_id filter is what makes
  // /t/[A-slug]/classroom/topic/[B-owned-id] resolve to null (→ notFound) rather than
  // rendering B's topic under A's shell. NOT defense-in-depth — required.
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load topic: ${error.message}`)
  }

  return (data ?? null) as Topic | null
}

export async function getContentItems(
  topicId: string,
  teacherId: string,
): Promise<ContentItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('topic_id', topicId)
    .eq('teacher_id', teacherId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load content items: ${error.message}`)
  }

  return (data ?? []) as ContentItem[]
}

export async function getContentItem(
  id: string,
  teacherId: string,
): Promise<ContentItem | null> {
  const supabase = await createClient()

  // LOAD-BEARING teacher_id filter — same rationale as getTopic (dual-member could
  // otherwise open /t/[A-slug]/classroom/content/[B-owned-id]).
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load content item: ${error.message}`)
  }

  return (data ?? null) as ContentItem | null
}

// Progress reads stay user-keyed (no teacherId param). content_progress is a leaf
// table with no teacher_id; its RLS requires own-row AND has_membership(parent.teacher_id),
// and the contentItemIds passed in are already teacher-scoped (built from this teacher's
// items), so the read cannot return another teacher's progress.
export async function getUserProgress(
  userId: string,
  contentItemIds: string[],
): Promise<Set<string>> {
  if (contentItemIds.length === 0) {
    return new Set<string>()
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_progress')
    .select('content_item_id')
    .eq('user_id', userId)
    .in('content_item_id', contentItemIds)

  if (error) {
    throw new Error(`Failed to load progress: ${error.message}`)
  }

  const rows = (data ?? []) as { content_item_id: string }[]
  return new Set(rows.map((row) => row.content_item_id))
}

export async function isContentCompleted(
  userId: string,
  contentItemId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_progress')
    .select('content_item_id')
    .eq('user_id', userId)
    .eq('content_item_id', contentItemId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load completion state: ${error.message}`)
  }

  return !!data
}
