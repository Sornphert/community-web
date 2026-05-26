'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import * as bunny from '@/lib/bunny'
import type { TusUploadCredentials } from '@/lib/bunny'
import type { ClassroomRecording } from '@/lib/types'

type ActionResult = { error?: string }
type ServerClient = Awaited<ReturnType<typeof createClient>>

// Shared admin guard. The DB-level enabler is the *_admin RLS policies from
// migration 0005; this is the belt-and-suspenders guard so a non-admin never
// reaches the write. Returns the supabase client + user id on success.
async function requireAdmin(): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_admin) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

function revalidate() {
  revalidatePath('/admin/classroom/recordings')
  revalidatePath('/classroom/recordings')
}

export async function createFolder(input: {
  name: string
  position: number
  parentFolderId: string | null
}): Promise<ActionResult> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Name is required.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { error } = await auth.supabase.from('classroom_folders').insert({
    name,
    position: input.position,
    parent_folder_id: input.parentFolderId,
    created_by: auth.userId,
  })

  if (error) {
    return { error: error.message }
  }

  revalidate()
  return {}
}

export async function updateFolder(input: {
  id: string
  name: string
  position: number
}): Promise<ActionResult> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Name is required.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('classroom_folders')
    .update({ name, position: input.position })
    .eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidate()
  return {}
}

export async function deleteFolder(input: { id: string }): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('classroom_folders')
    .delete()
    .eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidate()
  return {}
}

export async function createRecording(input: {
  folderId: string
  title: string
  description: string
  position: number
}): Promise<{ error?: string; recording?: ClassroomRecording }> {
  const title = input.title.trim()
  if (!title) {
    return { error: 'Title is required.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  // Insert the recording row first so a flaky Bunny call never blocks creation.
  const { data: inserted, error } = await auth.supabase
    .from('classroom_recordings')
    .insert({
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
    .select('*')
    .single()

  if (updateError) {
    return { error: updateError.message }
  }

  revalidate()
  return { recording: updated as ClassroomRecording }
}

export async function updateRecording(input: {
  id: string
  title: string
  description: string
  position: number
}): Promise<ActionResult> {
  const title = input.title.trim()
  if (!title) {
    return { error: 'Title is required.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('classroom_recordings')
    .update({
      title,
      description: input.description.trim() || null,
      position: input.position,
    })
    .eq('id', input.id)

  if (error) {
    return { error: error.message }
  }

  revalidate()
  return {}
}

export async function deleteRecording(input: {
  id: string
}): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  // Clean up the Bunny video first, but never let a flaky Bunny call orphan the
  // DB row — log and proceed with the delete regardless.
  const { data: existing } = await auth.supabase
    .from('classroom_recordings')
    .select('video_id')
    .eq('id', input.id)
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

  if (error) {
    return { error: error.message }
  }

  revalidate()
  return {}
}

// Issues presigned TUS credentials so the browser can upload directly to Bunny
// without the API key. Flips the recording to 'processing' — the upload has
// begun; the webhook (or Refresh) will flip it to 'ready' once transcoded.
export async function getRecordingUploadCredentials(
  recordingId: string,
): Promise<{ error?: string; credentials?: TusUploadCredentials }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { data: recording, error } = await auth.supabase
    .from('classroom_recordings')
    .select('video_id')
    .eq('id', recordingId)
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

  if (updateError) {
    return { error: updateError.message }
  }

  revalidate()
  return { credentials }
}

// Manual fallback for when the webhook misses an event: re-reads the
// authoritative status from Bunny and syncs our row.
export async function refreshRecordingStatus(id: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const { data: recording, error } = await auth.supabase
    .from('classroom_recordings')
    .select('video_id')
    .eq('id', id)
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

  if (updateError) {
    return { error: updateError.message }
  }

  revalidate()
  return {}
}
