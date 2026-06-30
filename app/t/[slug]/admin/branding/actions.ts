'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  MAX_TEACHER_DESCRIPTION_LEN,
  TEACHER_COVERS_BUCKET,
  TEACHER_LOGOS_BUCKET,
} from '@/lib/teacher-branding'
import type { Teacher } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] Per-teacher admin guard — mirrors topics/actions.ts. The admin layout guards
// RENDERS only; server actions are POST endpoints reached independently of any
// layout, so this per-action guard is mandatory (RLS is the real authority on writes).
async function requireTeacherAdmin(teacherId: string): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: teacherId,
  })
  if (data !== true) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

// Parse the in-bucket storage path out of a public URL (same style as
// delete_my_account's avatar parse). The URL is
// .../object/public/<bucket>/<path>[?v=...]; take the part after '/<bucket>/' and
// strip any query string. Returns '' when there is nothing to parse (null URL,
// first-ever upload, or a URL that doesn't contain the bucket segment) — the caller
// uses that to SKIP the cleanup delete entirely (never remove(['']))
function parseStoragePath(url: string | null, bucket: string): string {
  if (!url) return ''
  const marker = `/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return ''
  const afterBucket = url.slice(idx + marker.length)
  // Handle a getPublicUrl URL both with and without a trailing query string.
  return afterBucket.split('?')[0]
}

export async function updateTeacherCover(input: {
  teacherId: string
  coverUrl: string
  coverStoragePath: string
}): Promise<{ error?: string; teacher?: Teacher }> {
  if (!input.coverUrl || !input.coverStoragePath) {
    return { error: 'The cover upload is missing.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // Grab the existing cover URL FIRST so we can clean up the old object after the
  // swap (no cover_storage_path column — parse the path out of the old URL).
  const { data: existing } = await auth.supabase
    .from('teachers')
    .select('cover_url')
    .eq('id', input.teacherId)
    .maybeSingle()

  const { data, error } = await auth.supabase
    .from('teachers')
    .update({ cover_url: input.coverUrl })
    .eq('id', input.teacherId)
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  // Best-effort: delete the previous cover object so replacing it doesn't orphan
  // files. Skip entirely when there is no prior path (first upload) or it equals
  // the new one. A failure here only leaves an orphan — the row is already updated.
  const oldPath = parseStoragePath(existing?.cover_url ?? null, TEACHER_COVERS_BUCKET)
  if (oldPath && oldPath !== input.coverStoragePath) {
    await auth.supabase.storage.from(TEACHER_COVERS_BUCKET).remove([oldPath])
  }

  revalidatePath('/', 'layout')
  return { teacher: data as Teacher }
}

export async function updateTeacherLogo(input: {
  teacherId: string
  logoUrl: string
  logoStoragePath: string
}): Promise<{ error?: string; teacher?: Teacher }> {
  if (!input.logoUrl || !input.logoStoragePath) {
    return { error: 'The logo upload is missing.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { data: existing } = await auth.supabase
    .from('teachers')
    .select('logo_url')
    .eq('id', input.teacherId)
    .maybeSingle()

  const { data, error } = await auth.supabase
    .from('teachers')
    .update({ logo_url: input.logoUrl })
    .eq('id', input.teacherId)
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  const oldPath = parseStoragePath(existing?.logo_url ?? null, TEACHER_LOGOS_BUCKET)
  if (oldPath && oldPath !== input.logoStoragePath) {
    await auth.supabase.storage.from(TEACHER_LOGOS_BUCKET).remove([oldPath])
  }

  revalidatePath('/', 'layout')
  return { teacher: data as Teacher }
}

export async function updateTeacherDescription(input: {
  teacherId: string
  description: string
}): Promise<{ error?: string; teacher?: Teacher }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  // TRIM first, THEN length-check, THEN empty-string → null (a cleared description
  // reads back as null, which the directory uses to pick its fallback).
  const trimmed = input.description.trim()
  if (trimmed.length > MAX_TEACHER_DESCRIPTION_LEN) {
    return {
      error: `Description is too long (max ${MAX_TEACHER_DESCRIPTION_LEN} characters).`,
    }
  }

  const { data, error } = await auth.supabase
    .from('teachers')
    .update({ description: trimmed === '' ? null : trimmed })
    .eq('id', input.teacherId)
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { teacher: data as Teacher }
}
