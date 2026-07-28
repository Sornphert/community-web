'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as bunny from '@/lib/bunny'
import type { TusUploadCredentials } from '@/lib/bunny'
import { CONTENT_FILES_BUCKET } from '@/lib/content-files'
import { TOPIC_COVERS_BUCKET } from '@/lib/topic-covers'
import type { ContentItem } from '@/lib/types'

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
    .select('document_storage_path, video_id')
    .eq('id', input.itemId)
    .eq('teacher_id', input.teacherId)
    .maybeSingle()

  // Best-effort Bunny cleanup before the row goes (a flaky call must not block).
  if (item?.video_id) {
    try {
      await bunny.deleteVideo(item.video_id)
    } catch (e) {
      console.error(`Bunny deleteVideo failed for ${item.video_id}.`, e)
    }
  }

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

// ── Lesson folders (0039) — nested up to 3 levels within a topic. ──────────────

// Create a folder. parentFolderId nests it; depth is capped at 3. Appends among
// siblings. Enforced in-app (RLS handles the admin gate).
export async function createLessonFolder(input: {
  teacherId: string
  topicId: string
  parentFolderId: string | null
  name: string
}): Promise<{ error?: string; success?: true }> {
  const name = input.name.trim()
  if (!name) return { error: 'Folder name is required.' }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Depth cap: a folder may sit at level 1, 2, or 3. Reject a 4th level.
  if (input.parentFolderId) {
    const { data: parent } = await auth.supabase
      .from('lesson_folders')
      .select('parent_folder_id')
      .eq('id', input.parentFolderId)
      .eq('teacher_id', input.teacherId)
      .maybeSingle()
    if (parent?.parent_folder_id) {
      const { data: grandparent } = await auth.supabase
        .from('lesson_folders')
        .select('parent_folder_id')
        .eq('id', parent.parent_folder_id)
        .eq('teacher_id', input.teacherId)
        .maybeSingle()
      if (grandparent?.parent_folder_id) {
        return { error: 'Folders can only go 3 levels deep.' }
      }
    }
  }

  let siblingQuery = auth.supabase
    .from('lesson_folders')
    .select('position')
    .eq('topic_id', input.topicId)
    .eq('teacher_id', input.teacherId)
  siblingQuery = input.parentFolderId
    ? siblingQuery.eq('parent_folder_id', input.parentFolderId)
    : siblingQuery.is('parent_folder_id', null)
  const { data: last } = await siblingQuery
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (last?.position ?? -1) + 1

  const { error } = await auth.supabase.from('lesson_folders').insert({
    teacher_id: input.teacherId,
    topic_id: input.topicId,
    parent_folder_id: input.parentFolderId,
    name,
    position,
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function renameLessonFolder(input: {
  teacherId: string
  folderId: string
  name: string
}): Promise<{ error?: string; success?: true }> {
  const name = input.name.trim()
  if (!name) return { error: 'Folder name is required.' }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('lesson_folders')
    .update({ name })
    .eq('id', input.folderId)
    .eq('teacher_id', input.teacherId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Delete a folder. Sub-folders cascade; lessons inside fall back to the topic root
// (folder_id → null) so nothing is lost.
export async function deleteLessonFolder(input: {
  teacherId: string
  folderId: string
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('lesson_folders')
    .delete()
    .eq('id', input.folderId)
    .eq('teacher_id', input.teacherId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}

// Create a video lesson (Bunny upload). Provisions a Bunny video first so the row
// satisfies the payload check (type='video' needs video_id), appends it at the
// bottom, and returns it so the client can start the TUS upload. Mirrors the
// recordings createRecording flow.
export async function createVideoLesson(input: {
  teacherId: string
  topicId: string
  title: string
  description: string
  folderId?: string | null
}): Promise<{ error?: string; item?: ContentItem }> {
  const title = input.title.trim()
  if (!title) return { error: 'Title is required.' }
  if (!input.topicId) return { error: 'Missing topic.' }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { count } = await auth.supabase
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', input.topicId)
    .eq('teacher_id', input.teacherId)

  let videoId: string
  try {
    ;({ videoId } = await bunny.createVideo(title))
  } catch (e) {
    return {
      error: `Bunny video setup failed: ${
        e instanceof Error ? e.message : 'unknown error'
      }`,
    }
  }

  const { data, error } = await auth.supabase
    .from('content_items')
    .insert({
      teacher_id: input.teacherId,
      topic_id: input.topicId,
      type: 'video',
      title,
      description: input.description.trim() || null,
      video_id: videoId,
      video_provider: 'bunny',
      video_status: 'pending',
      folder_id: input.folderId ?? null,
      position: count ?? 0,
    })
    .select('*')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { item: data as ContentItem }
}

// Mint presigned TUS credentials so the browser uploads the video directly to Bunny
// (API key never reaches the client); flips the item to 'processing'.
export async function getLessonVideoUploadCredentials(
  teacherId: string,
  itemId: string,
): Promise<{ error?: string; credentials?: TusUploadCredentials }> {
  const auth = await requireTeacherAdmin(teacherId)
  if ('error' in auth) return auth

  const { data: item } = await auth.supabase
    .from('content_items')
    .select('video_id')
    .eq('id', itemId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (!item?.video_id) return { error: 'This lesson has no Bunny video yet.' }

  let credentials: TusUploadCredentials
  try {
    credentials = bunny.getTusUploadCredentials(item.video_id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to sign upload.' }
  }

  await auth.supabase
    .from('content_items')
    .update({ video_status: 'processing' })
    .eq('id', itemId)
    .eq('teacher_id', teacherId)

  revalidatePath('/', 'layout')
  return { credentials }
}

// Manual fallback when the webhook misses an event: re-read status from Bunny.
export async function refreshLessonVideoStatus(
  teacherId: string,
  itemId: string,
): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(teacherId)
  if ('error' in auth) return auth

  const { data: item } = await auth.supabase
    .from('content_items')
    .select('video_id')
    .eq('id', itemId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (!item?.video_id) return { error: 'This lesson has no Bunny video yet.' }

  let info: Awaited<ReturnType<typeof bunny.getVideo>>
  let next: ReturnType<typeof bunny.mapBunnyStatusToVideoStatus>
  try {
    info = await bunny.getVideo(item.video_id)
    next = bunny.mapBunnyStatusToVideoStatus(info.status)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to read status.' }
  }
  if (!next) return { success: true }

  const update: Record<string, unknown> = { video_status: next }
  if (next === 'ready') {
    update.video_duration_seconds = info.length
    update.video_thumbnail_url = bunny.getThumbnailUrl(item.video_id)
  }

  const { error } = await auth.supabase
    .from('content_items')
    .update(update)
    .eq('id', itemId)
    .eq('teacher_id', teacherId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { success: true }
}
