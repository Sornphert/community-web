'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ContentItem, Topic } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] Per-teacher admin guard. Resolves admin status through the SAME
// is_teacher_admin RPC the topics/content_items *_admin RLS policies call, keyed to
// a specific teacher — never a global is_admin (that column is gone under MT). This
// is the belt-and-suspenders layer so a non-admin (or an admin of a DIFFERENT
// teacher) never reaches the write; RLS is the real enforcement. Mirrors the events
// actions' requireTeacherAdmin.
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

export async function createTopic(input: {
  teacherId: string
  name: string
  coverImageUrl?: string | null
  coverStoragePath?: string | null
}): Promise<{ error?: string; topic?: Topic }> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Topic name is required.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Only `name` is required — position/is_locked/etc. use DB defaults. The cover
  // is optional; the client uploads it to topic-covers first and passes the
  // resulting URL + path (both null when no cover was attached).
  const { data, error } = await auth.supabase
    .from('topics')
    .insert({
      teacher_id: input.teacherId,
      name,
      cover_image_url: input.coverImageUrl ?? null,
      cover_storage_path: input.coverStoragePath ?? null,
    })
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { topic: data as Topic }
}

export async function createDocumentLesson(input: {
  teacherId: string
  topicId: string
  title: string
  description: string
  documentUrl: string
  documentStoragePath: string
  thumbnailUrl: string | null
}): Promise<{ error?: string; item?: ContentItem }> {
  const title = input.title.trim()
  if (!title) {
    return { error: 'Title is required.' }
  }
  if (!input.topicId) {
    return { error: 'Please choose a topic.' }
  }
  if (!input.documentUrl) {
    return { error: 'The file upload is missing.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Append after existing lessons in this topic for stable ordering. Scope the
  // count by teacher_id so it can never see another teacher's items.
  const { count, error: countError } = await auth.supabase
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', input.topicId)
    .eq('teacher_id', input.teacherId)

  if (countError) {
    return { error: countError.message }
  }

  const { data, error } = await auth.supabase
    .from('content_items')
    .insert({
      teacher_id: input.teacherId,
      topic_id: input.topicId,
      type: 'document',
      title,
      description: input.description.trim() || null,
      document_url: input.documentUrl,
      document_storage_path: input.documentStoragePath,
      thumbnail_url: input.thumbnailUrl,
      position: count ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { item: data as ContentItem }
}
