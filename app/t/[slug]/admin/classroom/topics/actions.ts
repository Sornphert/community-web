'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TOPIC_COVERS_BUCKET } from '@/lib/topic-covers'
import type { Topic } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] Per-teacher admin guard — mirrors the documents actions' helper (and the
// events requireTeacherAdmin). The topics *_admin RLS is the real enabler.
async function requireTeacherAdmin(teacherId: string): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: teacherId,
  })
  if (data !== true) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

export async function updateTopicCover(input: {
  teacherId: string
  topicId: string
  coverImageUrl: string
  coverStoragePath: string
}): Promise<{ error?: string; topic?: Topic }> {
  if (!input.topicId) {
    return { error: 'Missing topic.' }
  }
  if (!input.coverImageUrl || !input.coverStoragePath) {
    return { error: 'The cover upload is missing.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Grab the existing cover path first so we can clean it up after the swap. Scope
  // by teacher_id so an admin of teacher X can never touch teacher Y's topic row.
  const { data: existing } = await auth.supabase
    .from('topics')
    .select('cover_storage_path')
    .eq('id', input.topicId)
    .eq('teacher_id', input.teacherId)
    .maybeSingle()

  const { data, error } = await auth.supabase
    .from('topics')
    .update({
      cover_image_url: input.coverImageUrl,
      cover_storage_path: input.coverStoragePath,
    })
    .eq('id', input.topicId)
    .eq('teacher_id', input.teacherId)
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  // Best-effort: delete the previous cover object so replacing covers doesn't
  // orphan files (account deletion cleanup never touches topic-covers). A failure
  // here only leaves an orphan — the row is already updated, so we ignore it.
  const oldPath = existing?.cover_storage_path
  if (oldPath && oldPath !== input.coverStoragePath) {
    await auth.supabase.storage.from(TOPIC_COVERS_BUCKET).remove([oldPath])
  }

  revalidatePath('/', 'layout')
  return { topic: data as Topic }
}

// Map the Postgres error codes a topic_tags write can raise to clean denial copy — same
// shape as the tags manager (surface 1). A forged/raced tag_id or topic_id that doesn't
// belong to teacherId trips a composite same-teacher FK (23503) rather than writing; we
// surface it as a denial instead of a 500. 23505 (PK dup = already attached) never reaches
// here — addTopicTag treats it as idempotent success before calling this.
function mapWriteError(code: string | undefined, fallback: string): string {
  if (code === '23503') return 'That tag is no longer available.'
  return fallback
}

// Attach a tag as a REQUIREMENT of a topic (member-facing gating is enforced by
// can_access_topic in SQL — this only records the requirement). teacherId is
// attacker-controllable POST input: requireTeacherAdmin(teacherId), the
// topic_tags_insert_admin RLS WITH CHECK, and the two composite same-teacher FKs (topic
// AND tag must both belong to teacherId) are the authorization boundary. The insert also
// stamps teacher_id explicitly so the FKs re-verify both sides against the same tenant.
export async function addTopicTag(input: {
  teacherId: string
  topicId: string
  tagId: string
  slug: string
}): Promise<{ error?: string; success?: true }> {
  if (!input.topicId || !input.tagId) {
    return { error: 'Missing topic or tag.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase.from('topic_tags').insert({
    topic_id: input.topicId,
    tag_id: input.tagId,
    teacher_id: input.teacherId,
  })

  if (error) {
    // 23505 = composite PK (topic_id, tag_id) dup: already attached. The desired end
    // state already holds, so treat it as success (idempotent, race-safe re-toggle).
    if (error.code !== '23505') {
      return { error: mapWriteError(error.code, error.message) }
    }
  }

  // Admin route ONLY. Member lock reads (canAccessTopic et al.) are per-request cache() —
  // there is no cross-request cache entry to invalidate, so no '/' or 'layout' revalidate.
  revalidatePath(`/t/${input.slug}/admin/classroom/topics`)
  return { success: true }
}

// Remove a tag requirement from a topic. Scoped by teacher_id (belt-and-suspenders over
// topic_tags_delete_admin RLS) so an admin of teacher X can never unlink teacher Y's row.
// A no-op delete (already detached / never existed) is success — the end state holds.
export async function removeTopicTag(input: {
  teacherId: string
  topicId: string
  tagId: string
  slug: string
}): Promise<{ error?: string; success?: true }> {
  if (!input.topicId || !input.tagId) {
    return { error: 'Missing topic or tag.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('topic_tags')
    .delete()
    .eq('topic_id', input.topicId)
    .eq('tag_id', input.tagId)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }

  revalidatePath(`/t/${input.slug}/admin/classroom/topics`)
  return { success: true }
}
