'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Shared by Part 2 (web UI) and reusable as the reference flow for Part 3
// (mobile). Calls the atomic delete_my_account() RPC, then deletes the storage
// files it returns. No UI here — the caller handles confirmation + redirect.
//
// Error codes returned for the UI to display:
//   'not_authenticated'      — "You must be signed in."
//   'last_admin'             — "You're the last admin of <teacher(s)>. Assign
//                               another admin there first." (names in `teachers`)
//   'storage_cleanup_failed' — "Account couldn't be fully deleted due to a
//                               storage issue. Please contact support."
type DeleteResult = { ok: true } | { ok: false; error: string; teachers?: string[] }

type DeleteAccountResponse = {
  success: boolean
  error?: string
  teachers?: string[]
  storage_paths?: {
    avatars: string[]
    'post-images': string[]
    'post-attachments': string[]
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
    return { ok: false, error: res.error ?? 'unknown', teachers: res.teachers }
  }

  // The DB transaction is committed: the account is ALREADY deleted. Storage is
  // external and best-effort — destroy-then-cleanup means a failure here leaves
  // orphaned files only, never an undeleted account (compliance: deletion must
  // not be blocked by a storage hiccup). The service-role client is session-
  // independent (the user's auth.users row is already gone).
  try {
    const admin = createAdminClient()
    const buckets: Array<[string, string[]]> = [
      ['avatars', res.storage_paths?.avatars ?? []],
      ['post-images', res.storage_paths?.['post-images'] ?? []],
      ['post-attachments', res.storage_paths?.['post-attachments'] ?? []],
    ]

    // .remove() RESOLVES with { error } instead of throwing, so the error must
    // be read off each result — a bare try/catch alone would swallow it.
    const errors: { bucket: string; error: unknown }[] = []
    for (const [bucket, paths] of buckets) {
      if (paths.length === 0) continue
      const { error } = await admin.storage.from(bucket).remove(paths)
      if (error) errors.push({ bucket, error })
    }

    if (errors.length > 0) {
      console.error('delete_my_account storage cleanup failed', errors)
      return { ok: false, error: 'storage_cleanup_failed' }
    }
  } catch (e) {
    // Thrown errors (network / client construction) — same tolerated outcome.
    console.error('delete_my_account storage cleanup threw', e)
    return { ok: false, error: 'storage_cleanup_failed' }
  }

  // The session is already invalid (auth.users deleted); ignore signOut errors.
  await supabase.auth.signOut().catch(() => {})

  return { ok: true }
}
