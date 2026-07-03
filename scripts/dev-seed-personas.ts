/**
 * scripts/dev-seed-personas.ts
 * Recreates the community-mt-dev DEV PERSONAS — the part that cannot live in seed.sql,
 * because auth.users rows need hashed passwords via the admin API.
 *
 * Run AFTER multitenant/schema.sql + multitenant/seed.sql, against a DEV/throwaway DB.
 * Point env at the TARGET dev project (NEVER prod):
 *   set -a; source .env.local; set +a            # or export the two vars manually
 *   npx tsx scripts/dev-seed-personas.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotent: existing users matched by email are reused; memberships + demo posts
 * upsert on their natural keys. NOTE: re-running against community-mt-dev itself will
 * INSERT the two demo posts (fixed UUIDs) that aren't currently there — harmless on dev.
 *
 * SEVEN personas — community-mt-dev has a B-only member (bmember@) beyond the originally
 * documented six. Password for all: devpass123!
 *   admin@   → A admin                 member@  → A member        dual@    → A+B member
 *   revoked@ → A member (revoked)       badmin@  → A member + B admin ("Cross admin")
 *   bmember@ → B member ("B member")    none@    → no memberships
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const PASSWORD = 'devpass123!'
const A = 'a1a1a1a1-0000-0000-0000-000000000000' // prophet-system
const B = 'b2b2b2b2-0000-0000-0000-000000000000' // movement-bootcamp

type M = { teacher_id: string; role: 'member' | 'admin'; status: 'active' | 'revoked' }
type Persona = { email: string; displayName?: string; memberships: M[] }

// displayName is set ONLY where live used metadata; the rest fall back to the
// handle_new_user email-split (admin/member/dual/revoked/none).
const PERSONAS: Persona[] = [
  { email: 'admin@dev.test', memberships: [{ teacher_id: A, role: 'admin', status: 'active' }] },
  { email: 'member@dev.test', memberships: [{ teacher_id: A, role: 'member', status: 'active' }] },
  {
    email: 'dual@dev.test',
    memberships: [
      { teacher_id: A, role: 'member', status: 'active' },
      { teacher_id: B, role: 'member', status: 'active' },
    ],
  },
  { email: 'revoked@dev.test', memberships: [{ teacher_id: A, role: 'member', status: 'revoked' }] },
  {
    email: 'badmin@dev.test',
    displayName: 'Cross admin',
    memberships: [
      { teacher_id: A, role: 'member', status: 'active' },
      { teacher_id: B, role: 'admin', status: 'active' },
    ],
  },
  { email: 'bmember@dev.test', displayName: 'B member', memberships: [{ teacher_id: B, role: 'member', status: 'active' }] },
  { email: 'none@dev.test', memberships: [] },
]

const admin = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function listAllUsers(): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>()
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) if (u.email) byEmail.set(u.email, u.id)
    if (data.users.length < 200) break
  }
  return byEmail
}

async function main() {
  const existing = await listAllUsers()
  const idByEmail = new Map<string, string>()

  for (const p of PERSONAS) {
    const found = existing.get(p.email)
    if (found) {
      idByEmail.set(p.email, found)
      console.log(`= exists  ${p.email} (${found})`)
      continue
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: p.displayName ? { display_name: p.displayName } : {},
    })
    if (error || !data.user) throw error ?? new Error(`createUser failed for ${p.email}`)
    idByEmail.set(p.email, data.user.id)
    console.log(`+ created ${p.email} (${data.user.id})`)
  }

  // Memberships — service-role bypasses the write-less authenticated grant + RLS.
  const rows = PERSONAS.flatMap((p) =>
    p.memberships.map((m) => ({
      profile_id: idByEmail.get(p.email)!,
      teacher_id: m.teacher_id,
      role: m.role,
      status: m.status,
    })),
  )
  if (rows.length) {
    const { error } = await admin.from('memberships').upsert(rows, { onConflict: 'profile_id,teacher_id' })
    if (error) throw error
    console.log(`✓ upserted ${rows.length} memberships`)
  }

  // Demo posts so community isolation tests aren't vacuous (one per non-empty teacher).
  const posts = [
    {
      id: 'a1900000-0000-0000-0000-000000000001',
      teacher_id: A,
      author_id: idByEmail.get('admin@dev.test')!,
      channel_id: 'a1c00000-0000-0000-0000-000000000001',
      title: 'Welcome to A',
      body: 'First post in The Prophet System.',
    },
    {
      id: 'b2900000-0000-0000-0000-000000000001',
      teacher_id: B,
      author_id: idByEmail.get('badmin@dev.test')!,
      channel_id: 'b2c00000-0000-0000-0000-000000000001',
      title: 'Welcome to B',
      body: 'First post in Movement Bootcamp.',
    },
  ]
  const { error: postErr } = await admin.from('posts').upsert(posts, { onConflict: 'id' })
  if (postErr) throw postErr
  console.log(`✓ upserted ${posts.length} demo posts`)

  // Classroom tier tags (migration 0006). The two B tags are seeded in multitenant/seed.sql;
  // here we ASSIGN them to real personas (member_tags needs runtime profile_ids). The
  // composite (profile_id, teacher_id) FK requires an existing B membership — bmember@ and
  // dual@ both have one. bmember@ holds movexercise8 ONLY (must be DENIED the [bootcamp]-gated
  // B Fundamentals content_items at the API); dual@ holds BOTH (allowed).
  const MOVEXERCISE8 = 'b2100000-0000-0000-0000-000000000001'
  const BOOTCAMP = 'b2100000-0000-0000-0000-000000000002'
  const memberTags = [
    { profile_id: idByEmail.get('bmember@dev.test')!, tag_id: MOVEXERCISE8, teacher_id: B },
    { profile_id: idByEmail.get('dual@dev.test')!, tag_id: MOVEXERCISE8, teacher_id: B },
    { profile_id: idByEmail.get('dual@dev.test')!, tag_id: BOOTCAMP, teacher_id: B },
  ]
  const { error: tagErr } = await admin.from('member_tags').upsert(memberTags, { onConflict: 'profile_id,tag_id' })
  if (tagErr) throw tagErr
  console.log(`✓ upserted ${memberTags.length} member_tags`)

  console.log(`\nDone — ${PERSONAS.length} personas, password: ${PASSWORD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
