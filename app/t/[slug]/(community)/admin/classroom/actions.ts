'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { CONTENT_FILES_BUCKET } from '@/lib/content-files'
import { TOPIC_COVERS_BUCKET } from '@/lib/topic-covers'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Per-teacher admin guard — mirrors the documents/topics actions. The topics /
// content_items *_admin RLS policies are the real enforcement; this is the
// belt-and-suspenders layer.
async function requireTeacherAdmin(teacherId: string): Promise<
  { supabase: ServerClient } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const { data } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: teacherId,
  })
  if (data !== true) return { error: 'Admins only.' }
  return { supabase }
}

// Rename a topic. Scoped by teacher_id (belt-and-suspenders over topics_*_admin RLS).
export async function renameTopic(input: {
  teacherId: string
  topicId: string
  name: string
}): Promise<{ error?: string; success?: true }> {
  const name = input.name.trim()
  if (!name) return { error: 'Topic name is required.' }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('topics')
    .update({ name })
    .eq('id', input.topicId)
    .eq('teacher_id', input.teacherId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Delete a topic (its content_items + topic_tags cascade). The recordings topic is
// auto-managed and NOT deletable here. Best-effort removes the cover object.
export async function deleteTopic(input: {
  teacherId: string
  topicId: string
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { data: topic } = await auth.supabase
    .from('topics')
    .select('cover_storage_path')
    .eq('id', input.topicId)
    .eq('teacher_id', input.teacherId)
    .maybeSingle()

  const { error } = await auth.supabase
    .from('topics')
    .delete()
    .eq('id', input.topicId)
    .eq('teacher_id', input.teacherId)
  if (error) return { error: error.message }

  // Best-effort cover cleanup (an orphan is harmless; the row is already gone).
  if (topic?.cover_storage_path) {
    await auth.supabase.storage
      .from(TOPIC_COVERS_BUCKET)
      .remove([topic.cover_storage_path])
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Persist a new topic order. orderedIds is the full list in the desired order;
// each topic's position is set to its index. Scoped by teacher_id.
export async function reorderTopics(input: {
  teacherId: string
  orderedIds: string[]
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await auth.supabase
      .from('topics')
      .update({ position: i })
      .eq('id', input.orderedIds[i])
      .eq('teacher_id', input.teacherId)
    if (error) return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Persist a new lesson order within a topic.
export async function reorderContentItems(input: {
  teacherId: string
  orderedIds: string[]
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  for (let i = 0; i < input.orderedIds.length; i++) {
    const { error } = await auth.supabase
      .from('content_items')
      .update({ position: i })
      .eq('id', input.orderedIds[i])
      .eq('teacher_id', input.teacherId)
    if (error) return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Delete a single content item (document lesson). Best-effort removes its stored file.
export async function deleteContentItem(input: {
  teacherId: string
  itemId: string
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { data: item } = await auth.supabase
    .from('content_items')
    .select('document_storage_path')
    .eq('id', input.itemId)
    .eq('teacher_id', input.teacherId)
    .maybeSingle()

  const { error } = await auth.supabase
    .from('content_items')
    .delete()
    .eq('id', input.itemId)
    .eq('teacher_id', input.teacherId)
  if (error) return { error: error.message }

  if (item?.document_storage_path) {
    await auth.supabase.storage
      .from(CONTENT_FILES_BUCKET)
      .remove([item.document_storage_path])
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
