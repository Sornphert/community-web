'use server'

import { createClient } from '@/lib/supabase/server'
import * as bunny from '@/lib/bunny'
import type { TusUploadCredentials } from '@/lib/bunny'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Shared admin guard, scoped to THIS teacher. The DB-level enabler is the
// post_videos admin-only RLS policies; this is the belt-and-suspenders guard so a
// non-admin never reaches the Bunny call. [MT] Resolves admin via the same
// is_teacher_admin RPC the RLS uses, so the UI gate can't drift from security.
async function requireAdmin(
  teacherId: string,
): Promise<{ supabase: ServerClient; userId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: isAdmin, error } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: teacherId,
  })
  if (error || isAdmin !== true) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

// Provisions a Bunny video and returns presigned TUS credentials so the browser
// can upload directly to Bunny without ever seeing the API key. No DB write here
// — the post doesn't exist yet; the composer inserts the post_videos row (with
// this videoId) after the post itself is created. Mirrors createRecording +
// getRecordingUploadCredentials, minus the recording row.
export async function createPostVideoUploadCredentials(
  title: string,
  teacherId: string,
): Promise<{
  error?: string
  videoId?: string
  credentials?: TusUploadCredentials
}> {
  const auth = await requireAdmin(teacherId)
  if ('error' in auth) return auth

  let videoId: string
  try {
    ;({ videoId } = await bunny.createVideo(title.trim() || 'Post video'))
  } catch (e) {
    return {
      error: `Bunny video setup failed: ${
        e instanceof Error ? e.message : 'unknown error'
      }`,
    }
  }

  let credentials: TusUploadCredentials
  try {
    credentials = bunny.getTusUploadCredentials(videoId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to sign upload.' }
  }

  return { videoId, credentials }
}
