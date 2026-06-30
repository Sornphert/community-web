/**
 * scripts/dev-cleanup-mt-dev.ts  — THROWAWAY, SURGICAL CLEANUP (do not commit)
 *
 * Removes ONLY the misfired dev-seed-media.ts artifacts from community-mt-dev:
 *   - DELETE the exact fixed-UUID rows (.in('id', [...])) from posts / post_images
 *     / post_attachments — never a broad delete, truncate, or delete-by-author.
 *   - storage .remove() on the exact seeded paths only.
 *   - reset member@ avatar_url to null ONLY if it still matches the seeded path.
 *
 * INTENTIONALLY targets community-mt-dev — there is deliberately NO mt-dev
 * refusal guard here, because cleaning that exact project is the whole point.
 *
 *   set -a; source .env.local; set +a     # .env.local == community-mt-dev
 *   npx tsx scripts/dev-cleanup-mt-dev.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Tip: run dev-audit-mt-dev.ts before AND after to confirm the surgical effect.
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

async function deleteRows(table: string, ids: string[]) {
  // Delete strictly by the fixed UUID set — nothing else can be matched.
  const { data, error } = await admin.from(table).delete().in('id', ids).select('id')
  if (error) throw new Error(`delete ${table}: ${error.message}`)
  const removed = (data ?? []).map((r) => r.id as string)
  console.log(`  ${table}: removed ${removed.length}/${ids.length} [${removed.join(', ') || 'none'}]`)
}

async function removeObjects(bucket: string, paths: string[]) {
  if (paths.length === 0) { console.log(`  ${bucket}: (none)`); return }
  const { data, error } = await admin.storage.from(bucket).remove(paths)
  if (error) { console.log(`  ${bucket}: ERROR ${error.message}`); return }
  console.log(`  ${bucket}: removed ${(data ?? []).length} object(s) -> [${paths.join(', ')}]`)
}

async function main() {
  console.log(`Surgical cleanup of ${URL}\n${'='.repeat(60)}`)

  // --- 1. delete exact fixed-UUID rows (children first) ---
  console.log('\nrows:')
  await deleteRows('post_attachments', ATTACH_IDS)
  await deleteRows('post_images', IMG_IDS)
  await deleteRows('posts', POST_IDS)

  // --- 2. resolve persona uids live by email ---
  const member = await uidByEmail('member@dev.test')
  const dual = await uidByEmail('dual@dev.test')
  console.log(`\nuids:  member=${member ?? '(not found)'}  dual=${dual ?? '(not found)'}`)

  // --- 3. reset member@ avatar_url ONLY if it still matches the seeded path ---
  if (member) {
    const seededAvatarUrl = `${URL}/storage/v1/object/public/avatars/${A}/${member}/avatar.jpg`
    const { data, error } = await admin.from('profiles').select('avatar_url').eq('id', member).single()
    if (error) throw new Error(`select profiles: ${error.message}`)
    const cur = (data?.avatar_url as string | null) ?? null
    if (cur && cur.split('?')[0] === seededAvatarUrl) {
      const { error: upErr } = await admin.from('profiles').update({ avatar_url: null }).eq('id', member)
      if (upErr) throw new Error(`update profiles: ${upErr.message}`)
      console.log(`\nmember@ avatar_url: reset to null (matched seeded path)`)
    } else {
      console.log(`\nmember@ avatar_url: left unchanged (${cur ?? 'null'} — not the seeded path)`)
    }
  }

  // --- 4. remove exact storage objects dev-seed-media.ts wrote ---
  console.log(`\nstorage:`)
  const avatars: string[] = []
  const postImages: string[] = []
  const postAttachments: string[] = []
  if (member) {
    avatars.push(`${A}/${member}/avatar.jpg`)
    postImages.push(`${A}/${member}/${MEMBER_POST_A}/0.jpg`)
    postAttachments.push(`${A}/${member}/${MEMBER_POST_A}/doc.pdf`)
  }
  if (dual) {
    postImages.push(`${A}/${dual}/${DUAL_POST_A}/0.jpg`)
    postImages.push(`${B}/${dual}/${DUAL_POST_B}/0.jpg`)
  }
  await removeObjects('avatars', avatars)
  await removeObjects('post-images', postImages)
  await removeObjects('post-attachments', postAttachments)

  console.log(`\n${'='.repeat(60)}\nDone.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
