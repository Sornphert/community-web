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
