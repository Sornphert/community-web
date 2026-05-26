'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Shared by Part 2 (web UI) and reusable as the reference flow for Part 3
// (mobile). Calls the atomic delete_my_account() RPC, then deletes the storage
// files it returns. No UI here — the caller handles confirmation + redirect.
//
// Error codes returned for the UI to display:
//   'not_authenticated'      — "You must be signed in."
//   'is_admin'               — "You're an admin. Please demote yourself first
//                               via another admin before deleting your account."
//   'storage_cleanup_failed' — "Account couldn't be fully deleted due to a
//                               storage issue. Please contact support."
type DeleteResult = { ok: true } | { ok: false; error: string }

type DeleteAccountResponse = {
  success: boolean
  error?: string
  storage_paths?: {
    avatars: string[]
    'post-images': string[]
  }
}

export async function deleteMyAccount(): Promise<DeleteResult> {
  const supabase = await createClient()

  // Atomic DB deletion (tombstone profile, delete progress + post_images rows,
  // delete auth.users). Runs under the caller's session => auth.uid() is them.
  const { data, error } = await supabase.rpc('delete_my_account')
  if (error) {
    return { ok: false, error: error.message }
  }

  const res = data as DeleteAccountResponse
  if (!res.success) {
    return { ok: false, error: res.error ?? 'unknown' }
  }

  // The DB transaction is committed. Storage is external and can't be part of
  // it, so we clean it up here, best-effort. The auth.users row is already gone
  // so we use the service-role admin client (session-independent). A failure
  // here leaves orphaned files only — the account itself is fully deleted.
  try {
    const admin = createAdminClient()
    const avatars = res.storage_paths?.avatars ?? []
    const postImages = res.storage_paths?.['post-images'] ?? []

    if (avatars.length > 0) {
      await admin.storage.from('avatars').remove(avatars)
    }
    if (postImages.length > 0) {
      await admin.storage.from('post-images').remove(postImages)
    }
  } catch (e) {
    console.error('delete_my_account storage cleanup failed', e)
    return { ok: false, error: 'storage_cleanup_failed' }
  }

  // The session is already invalid (auth.users deleted); ignore signOut errors.
  await supabase.auth.signOut().catch(() => {})

  return { ok: true }
}
