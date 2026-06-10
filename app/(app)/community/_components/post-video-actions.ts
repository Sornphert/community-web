'use server'

import { createClient } from '@/lib/supabase/server'
import * as bunny from '@/lib/bunny'
import type { TusUploadCredentials } from '@/lib/bunny'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Shared admin guard. The DB-level enabler is the post_videos admin-only RLS
// policies from migration 0012; this is the belt-and-suspenders guard so a
// non-admin never reaches the Bunny call. Mirrors requireAdmin() in the
// classroom recordings actions.
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

// Provisions a Bunny video and returns presigned TUS credentials so the browser
// can upload directly to Bunny without ever seeing the API key. No DB write here
// — the post doesn't exist yet; the composer inserts the post_videos row (with
// this videoId) after the post itself is created. Mirrors createRecording +
// getRecordingUploadCredentials, minus the recording row.
export async function createPostVideoUploadCredentials(title: string): Promise<{
  error?: string
  videoId?: string
  credentials?: TusUploadCredentials
}> {
  const auth = await requireAdmin()
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
