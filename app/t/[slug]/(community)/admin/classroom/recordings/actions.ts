'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as bunny from '@/lib/bunny'
import type { TusUploadCredentials } from '@/lib/bunny'
import type { ClassroomRecording } from '@/lib/types'

type ActionResult = { error?: string }
type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] Per-teacher admin guard. Resolves admin status through the SAME
// is_teacher_admin RPC the classroom_folders/classroom_recordings *_admin RLS
// policies call, keyed to a specific teacher — never a global is_admin (gone under
// MT). Belt-and-suspenders; RLS is the real enforcement. Mirrors the events /
// documents actions' requireTeacherAdmin.
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

export async function createFolder(input: {
  teacherId: string
  name: string
  position: number
  parentFolderId: string | null
}): Promise<ActionResult> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Name is required.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase.from('classroom_folders').insert({
    teacher_id: input.teacherId,
    name,
    position: input.position,
    parent_folder_id: input.parentFolderId,
    created_by: auth.userId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function updateFolder(input: {
  teacherId: string
  id: string
  name: string
  position: number
}): Promise<ActionResult> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Name is required.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('classroom_folders')
    .update({ name, position: input.position })
    .eq('id', input.id)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function deleteFolder(input: {
  teacherId: string
  id: string
}): Promise<ActionResult> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('classroom_folders')
    .delete()
    .eq('id', input.id)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function createRecording(input: {
  teacherId: string
  folderId: string
  title: string
  description: string
  position: number
}): Promise<{ error?: string; recording?: ClassroomRecording }> {
  const title = input.title.trim()
  if (!title) {
    return { error: 'Title is required.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Insert the recording row first so a flaky Bunny call never blocks creation.
  // teacher_id is stamped HERE (the only insert) — the later Bunny update and the
  // upload-credentials path operate on this already-stamped row.
  const { data: inserted, error } = await auth.supabase
    .from('classroom_recordings')
    .insert({
      teacher_id: input.teacherId,
      folder_id: input.folderId,
      title,
      description: input.description.trim() || null,
      position: input.position,
      created_by: auth.userId,
    })
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  // Provision the Bunny video and record its id so the client can start uploading.
  let videoId: string
  try {
    ;({ videoId } = await bunny.createVideo(title))
  } catch (e) {
    // The row exists at 'pending'; surface the error so the admin can retry.
    return {
      error: `Recording created, but Bunny video setup failed: ${
        e instanceof Error ? e.message : 'unknown error'
      }`,
    }
  }

  const { data: updated, error: updateError } = await auth.supabase
    .from('classroom_recordings')
    .update({
      video_id: videoId,
      video_provider: 'bunny',
      video_status: 'pending',
    })
    .eq('id', inserted.id)
    .eq('teacher_id', input.teacherId)
    .select('*')
    .single()

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/', 'layout')
  return { recording: updated as ClassroomRecording }
}

export async function updateRecording(input: {
  teacherId: string
  id: string
  title: string
  description: string
  position: number
}): Promise<ActionResult> {
  const title = input.title.trim()
  if (!title) {
    return { error: 'Title is required.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('classroom_recordings')
    .update({
      title,
      description: input.description.trim() || null,
      position: input.position,
    })
    .eq('id', input.id)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function deleteRecording(input: {
  teacherId: string
  id: string
}): Promise<ActionResult> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Clean up the Bunny video first, but never let a flaky Bunny call orphan the
  // DB row — log and proceed with the delete regardless.
  const { data: existing } = await auth.supabase
    .from('classroom_recordings')
    .select('video_id')
    .eq('id', input.id)
    .eq('teacher_id', input.teacherId)
    .maybeSingle()

  if (existing?.video_id) {
    try {
      await bunny.deleteVideo(existing.video_id)
    } catch (e) {
      console.error(
        `Bunny deleteVideo failed for ${existing.video_id}; deleting DB row anyway.`,
        e,
      )
    }
  }

  const { error } = await auth.supabase
    .from('classroom_recordings')
    .delete()
    .eq('id', input.id)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

// Issues presigned TUS credentials so the browser can upload directly to Bunny
// without the API key. Flips the recording to 'processing' — the upload has
// begun; the webhook (or Refresh) will flip it to 'ready' once transcoded.
export async function getRecordingUploadCredentials(
  teacherId: string,
  recordingId: string,
): Promise<{ error?: string; credentials?: TusUploadCredentials }> {
  const auth = await requireTeacherAdmin(teacherId)
  if ('error' in auth) return auth

  const { data: recording, error } = await auth.supabase
    .from('classroom_recordings')
    .select('video_id')
    .eq('id', recordingId)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }
  if (!recording?.video_id) {
    return { error: 'This recording has no Bunny video yet.' }
  }

  let credentials: TusUploadCredentials
  try {
    credentials = bunny.getTusUploadCredentials(recording.video_id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to sign upload.' }
  }

  const { error: updateError } = await auth.supabase
    .from('classroom_recordings')
    .update({ video_status: 'processing' })
    .eq('id', recordingId)
    .eq('teacher_id', teacherId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/', 'layout')
  return { credentials }
}

// Manual fallback for when the webhook misses an event: re-reads the
// authoritative status from Bunny and syncs our row.
export async function refreshRecordingStatus(
  teacherId: string,
  id: string,
): Promise<ActionResult> {
  const auth = await requireTeacherAdmin(teacherId)
  if ('error' in auth) return auth

  const { data: recording, error } = await auth.supabase
    .from('classroom_recordings')
    .select('video_id')
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }
  if (!recording?.video_id) {
    return { error: 'This recording has no Bunny video yet.' }
  }

  let next: ReturnType<typeof bunny.mapBunnyStatusToVideoStatus>
  let info: Awaited<ReturnType<typeof bunny.getVideo>>
  try {
    info = await bunny.getVideo(recording.video_id)
    next = bunny.mapBunnyStatusToVideoStatus(info.status)
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to read Bunny status.',
    }
  }

  if (!next) {
    return {} // status we don't act on — leave the row unchanged
  }

  const update: Record<string, unknown> = { video_status: next }
  if (next === 'ready') {
    update.video_duration_seconds = info.length
    update.video_thumbnail_url = bunny.getThumbnailUrl(recording.video_id)
  }

  const { error: updateError } = await auth.supabase
    .from('classroom_recordings')
    .update(update)
    .eq('id', id)
    .eq('teacher_id', teacherId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath('/', 'layout')
  return {}
}
