/**
 * scripts/dev-seed-media.ts  — THROWAWAY TEST HELPER (do not commit)
 *
 * Seeds REAL storage objects + post media rows so the delete_my_account storage
 * assertions aren't vacuous. Run AFTER schema.sql + seed.sql + dev-seed-personas.ts,
 * against the THROWAWAY project only.
 *   set -a; source .env.throwaway; set +a   # NOT .env.local (that is community-mt-dev)
 *   npx tsx scripts/dev-seed-media.ts
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Idempotent (upserts).
 *
 * Seeds:
 *   member@  → avatar (A) + 1 post in A with 1 image + 1 attachment
 *   dual@    → 1 post in A (image) + 1 post in B (image)
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
// SAFETY: never run this test helper against community-mt-dev (ref below) or prod.
const MT_DEV_REF = 'ylptpshxwmocsitkcufh' // community-mt-dev
if (URL.includes(MT_DEV_REF)) {
  console.error(`REFUSING: target is community-mt-dev (${MT_DEV_REF}). Source .env.throwaway, not .env.local.`)
  process.exit(1)
}

const A = 'a1a1a1a1-0000-0000-0000-000000000000' // prophet-system
const B = 'b2b2b2b2-0000-0000-0000-000000000000' // movement-bootcamp
const A_GENERAL = 'a1c00000-0000-0000-0000-000000000001'
const B_GENERAL = 'b2c00000-0000-0000-0000-000000000001'

// Fixed ids so re-runs upsert rather than duplicate.
const MEMBER_POST_A = 'aa900000-0000-0000-0000-000000000011'
const DUAL_POST_A   = 'aa900000-0000-0000-0000-000000000012'
const DUAL_POST_B   = 'bb900000-0000-0000-0000-000000000012'
const MEMBER_IMG    = 'aaa10000-0000-0000-0000-000000000001'
const MEMBER_ATTACH = 'aaa20000-0000-0000-0000-000000000001'
const DUAL_IMG_A    = 'aaa10000-0000-0000-0000-000000000002'
const DUAL_IMG_B    = 'aaa10000-0000-0000-0000-000000000003'

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const pub = (bucket: string, path: string) => `${URL}/storage/v1/object/public/${bucket}/${path}`

async function uidByEmail(email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email === email)
    if (u) return u.id
    if (data.users.length < 200) break
  }
  throw new Error(`no auth user for ${email}`)
}

async function upload(bucket: string, path: string, bytes: string, contentType: string) {
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, Buffer.from(bytes), { contentType, upsert: true })
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`)
  console.log(`  ↑ ${bucket}/${path}`)
}

async function main() {
  const member = await uidByEmail('member@dev.test')
  const dual = await uidByEmail('dual@dev.test')
  const ts = Date.now()

  // --- member@ avatar (A) ---
  const avatarPath = `${A}/${member}/avatar.jpg`
  await upload('avatars', avatarPath, 'fake-jpeg-avatar', 'image/jpeg')
  {
    const { error } = await admin
      .from('profiles')
      .update({ avatar_url: `${pub('avatars', avatarPath)}?v=${ts}` })
      .eq('id', member)
    if (error) throw error
    console.log(`  ✓ member avatar_url set (with ?v= cache-bust)`)
  }

  // --- posts ---
  const posts = [
    { id: MEMBER_POST_A, teacher_id: A, author_id: member, channel_id: A_GENERAL, title: 'member A post', body: 'media seed' },
    { id: DUAL_POST_A,   teacher_id: A, author_id: dual,   channel_id: A_GENERAL, title: 'dual A post',   body: 'media seed' },
    { id: DUAL_POST_B,   teacher_id: B, author_id: dual,   channel_id: B_GENERAL, title: 'dual B post',   body: 'media seed' },
  ]
  {
    const { error } = await admin.from('posts').upsert(posts, { onConflict: 'id' })
    if (error) throw error
    console.log(`  ✓ upserted ${posts.length} posts`)
  }

  // --- post-images (path {teacher}/{uid}/{post}/0.jpg) ---
  const imgRows = [
    { id: MEMBER_IMG, post_id: MEMBER_POST_A, t: A, uid: member },
    { id: DUAL_IMG_A, post_id: DUAL_POST_A,   t: A, uid: dual },
    { id: DUAL_IMG_B, post_id: DUAL_POST_B,   t: B, uid: dual },
  ]
  for (const r of imgRows) {
    const path = `${r.t}/${r.uid}/${r.post_id}/0.jpg`
    await upload('post-images', path, 'fake-jpeg-image', 'image/jpeg')
    const { error } = await admin
      .from('post_images')
      .upsert({ id: r.id, post_id: r.post_id, url: pub('post-images', path), storage_path: path, position: 0 }, { onConflict: 'id' })
    if (error) throw error
  }
  console.log(`  ✓ upserted ${imgRows.length} post_images`)

  // --- post-attachments (member only; path {teacher}/{uid}/{post}/doc.pdf) ---
  {
    const path = `${A}/${member}/${MEMBER_POST_A}/doc.pdf`
    const bytes = 'fake-pdf-bytes'
    await upload('post-attachments', path, bytes, 'application/pdf')
    const { error } = await admin.from('post_attachments').upsert(
      { id: MEMBER_ATTACH, post_id: MEMBER_POST_A, url: pub('post-attachments', path), storage_path: path, file_name: 'doc.pdf', file_size: Buffer.from(bytes).length, position: 0 },
      { onConflict: 'id' },
    )
    if (error) throw error
    console.log(`  ✓ upserted 1 post_attachment`)
  }

  console.log('\nDone. member=' + member + '  dual=' + dual)
}

main().catch((e) => { console.error(e); process.exit(1) })
