/**
 * scripts/migrate-imported-storage.ts
 * Copies media that was IMPORTED from the single-tenant projects into THIS project's
 * own storage buckets, then rewrites the DB to point at the local copies.
 *
 * WHY THIS EXISTS
 * The content import (posts/comments/likes/profiles) copied database rows but not
 * files. Imported rows still reference their ORIGINAL public urls on the source
 * projects, so this project silently depends on Johnson's / Bootcamp's / Jane's
 * Supabase projects staying alive. Run this before decommissioning any of them —
 * otherwise every imported avatar, post image and banner 404s.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/migrate-imported-storage.ts            # dry run, changes nothing
 *   npx tsx scripts/migrate-imported-storage.ts --apply    # actually copy + rewrite
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (the TARGET project).
 * No source credentials are needed: the source buckets are public, so files are read
 * over plain HTTPS. Service role is used for the target because it must write to
 * storage and update rows regardless of RLS.
 *
 * IDEMPOTENT. Anything already pointing at the target host is skipped, so re-running
 * after a partial/failed run only does the remaining work.
 *
 * PATHS. Target paths follow the MT conventions:
 *   post-images    {teacher_id}/{author_id}/{post_id}/{position}.jpg
 *   avatars        {user_id}/avatar.jpg                (own-uid, per 0002)
 *   teacher-covers {teacher_id}/cover-{n}.{ext}
 *   teacher-logos  {teacher_id}/logo-{n}.{ext}
 * The cover/logo/hero columns are plain urls, so their filenames only need to be
 * stable and unique — the teacher_id prefix is what the storage RLS gates on.
 */

import { createClient } from '@supabase/supabase-js'

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY_ENV = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')

if (!URL_ENV || !KEY_ENV) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const TARGET_HOST = new URL(URL_ENV).hostname
const db = createClient(URL_ENV, KEY_ENV, { auth: { persistSession: false } })

let copied = 0
let skipped = 0
let failed = 0

function isForeign(url: string | null): url is string {
  if (!url) return false
  try {
    return new URL(url).hostname !== TARGET_HOST
  } catch {
    return false
  }
}

function extFrom(url: string, fallback = 'jpg'): string {
  const clean = url.split('?')[0]
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/)
  return m ? m[1].toLowerCase() : fallback
}

/** Fetch a public source url and upload it into a target bucket. Returns the new public url. */
async function copyOne(
  sourceUrl: string,
  bucket: string,
  targetPath: string,
): Promise<string | null> {
  if (!APPLY) {
    console.log(`  [dry] ${bucket}/${targetPath}`)
    return null
  }
  try {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
      console.warn(`  !! ${res.status} fetching ${sourceUrl}`)
      failed++
      return null
    }
    const body = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'

    const { error } = await db.storage
      .from(bucket)
      .upload(targetPath, body, { contentType, upsert: true })
    if (error) {
      console.warn(`  !! upload ${bucket}/${targetPath}: ${error.message}`)
      failed++
      return null
    }
    copied++
    return db.storage.from(bucket).getPublicUrl(targetPath).data.publicUrl
  } catch (e) {
    console.warn(`  !! ${(e as Error).message}`)
    failed++
    return null
  }
}

// ---------------------------------------------------------------- post images
async function migratePostImages() {
  console.log('\npost-images')
  const { data, error } = await db
    .from('post_images')
    .select('id, url, position, post_id, posts!inner(teacher_id, author_id)')
  if (error) throw error

  for (const row of (data ?? []) as unknown as {
    id: string
    url: string | null
    position: number
    post_id: string
    posts: { teacher_id: string; author_id: string }
  }[]) {
    if (!isForeign(row.url)) {
      skipped++
      continue
    }
    const { teacher_id, author_id } = row.posts
    const path = `${teacher_id}/${author_id}/${row.post_id}/${row.position}.${extFrom(row.url)}`
    const newUrl = await copyOne(row.url, 'post-images', path)
    if (newUrl) {
      await db
        .from('post_images')
        .update({ url: newUrl, storage_path: path })
        .eq('id', row.id)
    }
  }
}

// -------------------------------------------------------------------- avatars
async function migrateAvatars() {
  console.log('\navatars')
  const { data, error } = await db
    .from('profiles')
    .select('id, avatar_url')
    .not('avatar_url', 'is', null)
  if (error) throw error

  for (const row of (data ?? []) as { id: string; avatar_url: string }[]) {
    if (!isForeign(row.avatar_url)) {
      skipped++
      continue
    }
    // MT avatars are own-uid scoped: {uid}/avatar.jpg (0002).
    const path = `${row.id}/avatar.jpg`
    const newUrl = await copyOne(row.avatar_url, 'avatars', path)
    if (newUrl) {
      // Cache-bust so clients don't serve a stale cached avatar (app convention).
      await db
        .from('profiles')
        .update({ avatar_url: `${newUrl}?v=${Date.now()}` })
        .eq('id', row.id)
    }
  }
}

// ------------------------------------------------- teacher cover / logo / hero
async function migrateTeacherBranding() {
  console.log('\nteacher branding (cover / logo / hero)')
  const { data, error } = await db
    .from('teachers')
    .select('id, slug, cover_url, logo_url, hero_url')
  if (error) throw error

  for (const t of (data ?? []) as {
    id: string
    slug: string
    cover_url: string | null
    logo_url: string | null
    hero_url: string | null
  }[]) {
    const patch: Record<string, string> = {}

    for (const [column, bucket, base] of [
      ['cover_url', 'teacher-covers', 'cover'],
      ['hero_url', 'teacher-covers', 'hero'],
      ['logo_url', 'teacher-logos', 'logo'],
    ] as const) {
      const current = t[column]
      if (!isForeign(current)) {
        if (current) skipped++
        continue
      }
      const path = `${t.id}/${base}.${extFrom(current)}`
      const newUrl = await copyOne(current, bucket, path)
      if (newUrl) patch[column] = newUrl
    }

    if (Object.keys(patch).length > 0 && APPLY) {
      await db.from('teachers').update(patch).eq('id', t.id)
    }
  }
}

async function main() {
  console.log(
    APPLY
      ? `APPLY — copying imported media into ${TARGET_HOST}`
      : `DRY RUN — nothing will change. Re-run with --apply to execute.`,
  )

  await migratePostImages()
  await migrateAvatars()
  await migrateTeacherBranding()

  console.log(
    `\ndone. copied=${copied} skipped(already local)=${skipped} failed=${failed}`,
  )
  if (!APPLY) {
    console.log('This was a dry run. Re-run with --apply.')
  } else if (failed > 0) {
    console.log('Some files failed — safe to re-run; completed items are skipped.')
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
