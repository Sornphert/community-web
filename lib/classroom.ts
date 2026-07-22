import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  CONTENT_FILES_BUCKET,
  CONTENT_FILE_SIGNED_URL_TTL_SECONDS,
  contentFilePathFrom,
} from '@/lib/content-files'
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

// [0019] content-files is PRIVATE, so the stored /object/public/... urls are dead.
// Re-mint short-lived signed urls for document_url + thumbnail_url before handing
// items to the UI. Signing runs on the USER's client, so the storage SELECT policy
// (active member of the owning teacher) is the enforcement point — never swap this
// to the service-role client. External urls (no in-bucket path) pass through as-is,
// and a signing failure degrades to null rather than throwing: a broken thumbnail
// must not 500 a classroom page.
async function withSignedContentUrls<T extends ContentItem>(
  supabase: SupabaseClient,
  items: T[],
): Promise<T[]> {
  const paths = new Set<string>()
  for (const item of items) {
    const doc = contentFilePathFrom(item.document_storage_path, item.document_url)
    if (doc) paths.add(doc)
    const thumb = contentFilePathFrom(null, item.thumbnail_url)
    if (thumb) paths.add(thumb)
  }
  if (paths.size === 0) return items

  const list = [...paths]
  const { data } = await supabase.storage
    .from(CONTENT_FILES_BUCKET)
    .createSignedUrls(list, CONTENT_FILE_SIGNED_URL_TTL_SECONDS)

  const signed = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl)
  }

  return items.map((item) => {
    const docPath = contentFilePathFrom(
      item.document_storage_path,
      item.document_url,
    )
    const thumbPath = contentFilePathFrom(null, item.thumbnail_url)
    return {
      ...item,
      document_url: docPath
        ? (signed.get(docPath) ?? null)
        : item.document_url,
      thumbnail_url: thumbPath
        ? (signed.get(thumbPath) ?? null)
        : item.thumbnail_url,
    }
  })
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

  return withSignedContentUrls(supabase, (data ?? []) as ContentItem[])
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

  const item = (data ?? null) as ContentItem | null
  if (!item) return null
  return (await withSignedContentUrls(supabase, [item]))[0]
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

// [MT] TIER-TAG PRESENTATION (migration 0006). The RLS wall on content_items already
// ANDs can_access_topic(topic_id); these fetchers only expose the SAME function to the
// UI so the lock label can never drift from the wall. can_access_topic is SECURITY
// DEFINER (reads auth.uid()) — it is the SINGLE source of truth for "is this topic
// tag-locked for me?". We deliberately do NOT read member_tags/topic_tags to recompute
// the match in TS (that would be a second gate that can drift). topic_tags/tags are
// read ONLY for display names (getTopicRequiredTagNames), never to decide access.

// TRUE iff the current member may open this topic: it has NO required tags (ungated =
// open) OR the member holds >=1 of them. cache()-wrapped so the grid and the topic page
// dedupe to one RPC per topicId per request (mirrors hasMembership/isTeacherAdmin).
export const canAccessTopic = cache(
  async (topicId: string): Promise<boolean> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('can_access_topic', {
      p_topic_id: topicId,
    })
    if (error) {
      throw new Error(`can_access_topic(${topicId}) failed: ${error.message}`)
    }
    return data === true
  },
)

// Batch form for the classroom grid: given already-teacher-scoped topic ids, return the
// set the current member CANNOT access (tag-locked). Fans out canAccessTopic per id
// (cache()-deduped); the RPC is the only added grid query. Mirrors getUserProgress's
// already-scoped-ids signature (no teacherId — the ids come from getTopics(teacher.id)).
export async function getInaccessibleTopicIds(
  topicIds: string[],
): Promise<Set<string>> {
  if (topicIds.length === 0) {
    return new Set<string>()
  }

  const flags = await Promise.all(
    topicIds.map(
      async (id) => [id, await canAccessTopic(id)] as const,
    ),
  )

  return new Set(flags.filter(([, canAccess]) => !canAccess).map(([id]) => id))
}

// DISPLAY ONLY — the names of the tags a topic REQUIRES, for the topic-page locked panel
// ("Requires the X tag"). NOT an access decision (that is canAccessTopic). Two-step read
// to avoid PostgREST embed ambiguity (see CLAUDE.md Known Gotchas); both topic_tags and
// tags carry has_membership member-read RLS, so a member may read them. Never touches
// member_tags.
export async function getTopicRequiredTagNames(
  topicId: string,
  teacherId: string,
): Promise<string[]> {
  const supabase = await createClient()

  const { data: links, error: linksError } = await supabase
    .from('topic_tags')
    .select('tag_id')
    .eq('topic_id', topicId)
    .eq('teacher_id', teacherId)

  if (linksError) {
    throw new Error(`Failed to load topic tags: ${linksError.message}`)
  }

  const tagIds = (links ?? []).map((row) => (row as { tag_id: string }).tag_id)
  if (tagIds.length === 0) {
    return []
  }

  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select('name')
    .eq('teacher_id', teacherId)
    .in('id', tagIds)
    .order('name', { ascending: true })

  if (tagsError) {
    throw new Error(`Failed to load tag names: ${tagsError.message}`)
  }

  return (tags ?? []).map((row) => (row as { name: string }).name)
}
