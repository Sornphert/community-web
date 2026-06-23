'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Student-facing recording completion toggles. No admin check, and no teacher_id
// stamp: classroom_recording_progress is a leaf table keyed by (user_id,
// recording_id); its RLS restricts each user to their own rows AND requires
// has_membership(parent.teacher_id), so a write to another teacher's recording is
// rejected by RLS regardless of the (client-supplied) recordingId.

export async function markRecordingComplete(
  recordingId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { error } = await supabase
    .from('classroom_recording_progress')
    .upsert(
      { user_id: user.id, recording_id: recordingId },
      { onConflict: 'user_id,recording_id', ignoreDuplicates: true },
    )

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

export async function unmarkRecordingComplete(
  recordingId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { error } = await supabase
    .from('classroom_recording_progress')
    .delete()
    .eq('user_id', user.id)
    .eq('recording_id', recordingId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}
