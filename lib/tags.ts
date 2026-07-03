import { createClient } from '@/lib/supabase/server'
import type { Tag } from '@/lib/types'

// [MT] ADMIN-FACING tag reads (tags step 3). The member-facing PRESENTATION reads
// (canAccessTopic / getInaccessibleTopicIds / getTopicRequiredTagNames) stay in
// lib/classroom.ts — they must never recompute access, only mirror the RLS gate. This
// module is the read side of the admin CRUD surfaces and is only reached from
// /t/[slug]/admin/* (render-guarded by admin/layout.tsx + a per-page isTeacherAdmin
// check). Every fetcher takes a REQUIRED teacherId and filters teacher_id — under MT RLS
// an un-scoped read returns rows for EVERY teacher the viewer belongs to, so the .eq is
// the only thing preventing cross-tenant bleed for a dual-member admin.

// A tag plus its usage counts, for the manager list + the delete-confirm copy
// ("required on N topics, held by M members"). Counts come back under the same RLS as
// the caller: topic_tags is member-readable, member_tags is admin-readable-for-all — an
// admin (the only caller here) sees the full member count.
export type TagWithUsage = Tag & {
  topicCount: number
  memberCount: number
}

// All of a teacher's tags, name-ordered, each with topic/member usage counts. The counts
// ride PostgREST count-embeds on the two composite FKs into tags (each child table has
// exactly one FK to tags, so the embeds resolve unambiguously — no PGRST201). If that ever
// changes, fall back to two grouped reads of topic_tags/member_tags tallied in TS.
export async function getTeacherTags(
  teacherId: string,
): Promise<TagWithUsage[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tags')
    .select('id, name, color, created_at, topic_tags(count), member_tags(count)')
    .eq('teacher_id', teacherId)
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load tags: ${error.message}`)
  }

  type Row = Tag & {
    topic_tags: { count: number }[] | null
    member_tags: { count: number }[] | null
  }

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    created_at: row.created_at,
    topicCount: row.topic_tags?.[0]?.count ?? 0,
    memberCount: row.member_tags?.[0]?.count ?? 0,
  }))
}

// The tag_ids a topic currently REQUIRES, as a Set for O(1) toggle-state lookups in the
// per-topic gating editor. DISPLAY / TOGGLE-STATE ONLY — this never decides access (that
// is canAccessTopic in lib/classroom.ts). Scoped by teacher_id: under MT RLS an un-scoped
// read returns topic_tags rows for EVERY teacher the viewer belongs to, so the .eq is the
// only guard against cross-tenant bleed for a dual-member admin. An empty Set = ungated
// (open to all members).
export async function getTopicTagIds(
  topicId: string,
  teacherId: string,
): Promise<Set<string>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topic_tags')
    .select('tag_id')
    .eq('topic_id', topicId)
    .eq('teacher_id', teacherId)

  if (error) {
    throw new Error(`Failed to load topic tags: ${error.message}`)
  }

  return new Set(
    (data ?? []).map((row) => (row as { tag_id: string }).tag_id),
  )
}
