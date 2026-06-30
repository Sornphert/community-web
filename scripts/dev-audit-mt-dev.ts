/**
 * scripts/dev-audit-mt-dev.ts  — THROWAWAY, READ-ONLY AUDIT (do not commit)
 *
 * Reports whether the misfired dev-seed-media.ts artifacts exist on
 * community-mt-dev. Performs NO writes of any kind.
 *
 * INTENTIONALLY targets community-mt-dev — there is deliberately NO mt-dev
 * refusal guard here (unlike dev-seed-media.ts / dev-call-delete.ts), because
 * this script is meant to read that exact project.
 *
 *   set -a; source .env.local; set +a     # .env.local == community-mt-dev
 *   npx tsx scripts/dev-audit-mt-dev.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Fixed-UUID artifacts seeded by dev-seed-media.ts (mirrored here exactly).
const A = 'a1a1a1a1-0000-0000-0000-000000000000' // prophet-system (teacher A)
const B = 'b2b2b2b2-0000-0000-0000-000000000000' // movement-bootcamp (teacher B)

const MEMBER_POST_A = 'aa900000-0000-0000-0000-000000000011'
const DUAL_POST_A   = 'aa900000-0000-0000-0000-000000000012'
const DUAL_POST_B   = 'bb900000-0000-0000-0000-000000000012'
const MEMBER_IMG    = 'aaa10000-0000-0000-0000-000000000001'
const DUAL_IMG_A    = 'aaa10000-0000-0000-0000-000000000002'
const DUAL_IMG_B    = 'aaa10000-0000-0000-0000-000000000003'
const MEMBER_ATTACH = 'aaa20000-0000-0000-0000-000000000001'

const POST_IDS = [MEMBER_POST_A, DUAL_POST_A, DUAL_POST_B]
const IMG_IDS = [MEMBER_IMG, DUAL_IMG_A, DUAL_IMG_B]
const ATTACH_IDS = [MEMBER_ATTACH]

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function uidByEmail(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email === email)
    if (u) return u.id
    if (data.users.length < 200) break
  }
  return null
}

/** Read-only existence check for an exact `dir/.../file` object. */
async function objectExists(bucket: string, fullPath: string): Promise<boolean> {
  const idx = fullPath.lastIndexOf('/')
  const dir = idx === -1 ? '' : fullPath.slice(0, idx)
  const name = idx === -1 ? fullPath : fullPath.slice(idx + 1)
  const { data, error } = await admin.storage.from(bucket).list(dir, { search: name, limit: 100 })
  if (error) throw new Error(`list ${bucket}/${dir}: ${error.message}`)
  return (data ?? []).some((o) => o.name === name)
}

async function auditRows(table: string, ids: string[]) {
  const { data, error } = await admin.from(table).select('id').in('id', ids)
  if (error) throw new Error(`select ${table}: ${error.message}`)
  const found = new Set((data ?? []).map((r) => r.id as string))
  console.log(`\n${table}:`)
  for (const id of ids) console.log(`  ${found.has(id) ? 'EXISTS ' : 'absent '} ${id}`)
}

async function main() {
  console.log(`Auditing ${URL} (READ-ONLY)\n${'='.repeat(60)}`)

  // --- fixed-UUID rows ---
  await auditRows('posts', POST_IDS)
  await auditRows('post_images', IMG_IDS)
  await auditRows('post_attachments', ATTACH_IDS)

  // --- resolve persona uids live by email ---
  const member = await uidByEmail('member@dev.test')
  const dual = await uidByEmail('dual@dev.test')
  console.log(`\nuids:  member@dev.test = ${member ?? '(not found)'}`)
  console.log(`       dual@dev.test   = ${dual ?? '(not found)'}`)

  // --- member@ avatar_url ---
  if (member) {
    const { data, error } = await admin.from('profiles').select('avatar_url').eq('id', member).single()
    if (error) throw new Error(`select profiles: ${error.message}`)
    const seededAvatarUrl = `${URL}/storage/v1/object/public/avatars/${A}/${member}/avatar.jpg`
    const cur = (data?.avatar_url as string | null) ?? null
    const matchesSeed = !!cur && cur.split('?')[0] === seededAvatarUrl
    console.log(`\nmember@ avatar_url: ${cur ?? '(null)'}`)
    console.log(`  matches seeded path: ${matchesSeed ? 'YES (would be reset by cleanup)' : 'no'}`)
  }

  // --- storage objects (exactly the paths dev-seed-media.ts wrote) ---
  const objects: Array<[string, string]> = []
  if (member) {
    objects.push(['avatars', `${A}/${member}/avatar.jpg`])
    objects.push(['post-images', `${A}/${member}/${MEMBER_POST_A}/0.jpg`])
    objects.push(['post-attachments', `${A}/${member}/${MEMBER_POST_A}/doc.pdf`])
  }
  if (dual) {
    objects.push(['post-images', `${A}/${dual}/${DUAL_POST_A}/0.jpg`])
    objects.push(['post-images', `${B}/${dual}/${DUAL_POST_B}/0.jpg`])
  }

  console.log(`\nstorage objects:`)
  for (const [bucket, path] of objects) {
    const exists = await objectExists(bucket, path)
    console.log(`  ${exists ? 'EXISTS ' : 'absent '} ${bucket}/${path}`)
  }

  console.log(`\n${'='.repeat(60)}\nDone (no writes performed).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
