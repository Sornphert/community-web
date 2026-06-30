/**
 * scripts/dev-call-delete.ts  — THROWAWAY TEST HELPER (do not commit)
 *
 * Calls delete_my_account() AS a persona (real auth.uid()), printing the raw RPC
 * result. Mirrors app/(app)/profile/actions.ts: on success it ALSO runs the
 * service-role storage cleanup (reads each .remove() {error}) so the swallow-fix
 * is exercised. On a 'last_admin' / 'not_authenticated' block it removes nothing.
 *
 *   set -a; source .env.throwaway; set +a   # NOT .env.local (that is community-mt-dev)
 *   npx tsx scripts/dev-call-delete.ts admin@dev.test
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * IMPORTANT: capture object existence (SQL pre-capture) BEFORE running — this
 * removes the returned objects when deletion succeeds.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
// SAFETY: this CALLS delete_my_account — never against community-mt-dev (ref below) or prod.
const MT_DEV_REF = 'ylptpshxwmocsitkcufh' // community-mt-dev
if (URL.includes(MT_DEV_REF)) {
  console.error(`REFUSING: target is community-mt-dev (${MT_DEV_REF}). Source .env.throwaway, not .env.local.`)
  process.exit(1)
}
const email = process.argv[2]
if (!email) { console.error('usage: npx tsx scripts/dev-call-delete.ts <email>'); process.exit(1) }
const PASSWORD = 'devpass123!'

async function main() {
  const user = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: signInErr } = await user.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInErr) throw new Error(`signIn ${email}: ${signInErr.message}`)

  const { data, error } = await user.rpc('delete_my_account')
  if (error) { console.error('RPC error:', error.message); process.exit(1) }
  console.log(`\nRPC result for ${email}:`)
  console.log(JSON.stringify(data, null, 2))

  const res = data as {
    success: boolean
    error?: string
    teachers?: string[]
    storage_paths?: { avatars: string[]; 'post-images': string[]; 'post-attachments': string[] }
  }
  if (!res.success) {
    console.log(`\nBLOCKED (error=${res.error}${res.teachers ? ', teachers=' + res.teachers.join(', ') : ''}) — no storage removed.`)
    return
  }

  // Mirror actions.ts cleanup with the service-role client.
  const adminCli = createClient(URL!, SERVICE!, { auth: { autoRefreshToken: false, persistSession: false } })
  const buckets: Array<[string, string[]]> = [
    ['avatars', res.storage_paths?.avatars ?? []],
    ['post-images', res.storage_paths?.['post-images'] ?? []],
    ['post-attachments', res.storage_paths?.['post-attachments'] ?? []],
  ]
  for (const [bucket, paths] of buckets) {
    if (paths.length === 0) { console.log(`  (skip ${bucket}: none)`); continue }
    const { error: rmErr } = await adminCli.storage.from(bucket).remove(paths)
    console.log(`  remove ${bucket} [${paths.length}] -> ${rmErr ? 'ERROR ' + rmErr.message : 'ok'}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
