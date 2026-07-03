'use server'

import { createClient } from '@/lib/supabase/server'
import { MAX_TAG_NAME_LEN } from '@/lib/tag-constants'
import type { Tag } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] SECURITY BOUNDARY. teacherId arrives as a server-action argument — i.e. it is
// attacker-controllable POST input. This guard (re-checking is_teacher_admin FOR THIS
// teacherId), the tags_*_admin RLS WITH CHECK/USING, and the composite FKs are THE
// authorization boundary. That a page "derived" teacherId from the slug is NOT a
// protection — the layout guards renders, not action POSTs. So every action re-guards,
// and every write also re-scopes .eq('teacher_id', teacherId). Never trust the arg.
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

// Map the Postgres error codes these writes can raise to clean denial copy, so a
// duplicate name (23505) or a raced-revoke / cross-tenant / vanished-row FK violation
// (23503) surfaces as a message instead of a 500.
function mapWriteError(code: string | undefined, fallback: string): string {
  if (code === '23505') return 'A tag with that name already exists.'
  if (code === '23503') return 'That tag is no longer available.'
  return fallback
}

// Accept an optional #RRGGBB hex; anything else (empty, malformed) stores null.
function normalizeColor(color: string | null | undefined): string | null {
  if (!color) return null
  const trimmed = color.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null
}

export async function createTag(input: {
  teacherId: string
  name: string
  color?: string | null
}): Promise<{ error?: string; tag?: Tag }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const name = input.name.trim()
  if (!name) {
    return { error: 'Enter a tag name.' }
  }
  if (name.length > MAX_TAG_NAME_LEN) {
    return { error: `Tag name is too long (max ${MAX_TAG_NAME_LEN} characters).` }
  }

  const { data, error } = await auth.supabase
    .from('tags')
    .insert({
      teacher_id: input.teacherId,
      name,
      color: normalizeColor(input.color),
    })
    .select('id, name, color, created_at')
    .single()

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }

  return { tag: data as Tag }
}

export async function renameTag(input: {
  teacherId: string
  tagId: string
  name: string
}): Promise<{ error?: string; tag?: Tag }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const name = input.name.trim()
  if (!name) {
    return { error: 'Enter a tag name.' }
  }
  if (name.length > MAX_TAG_NAME_LEN) {
    return { error: `Tag name is too long (max ${MAX_TAG_NAME_LEN} characters).` }
  }

  // Scope by teacher_id so an admin of teacher X can never touch teacher Y's tag row
  // (belt-and-suspenders over tags_update_admin RLS).
  const { data, error } = await auth.supabase
    .from('tags')
    .update({ name })
    .eq('id', input.tagId)
    .eq('teacher_id', input.teacherId)
    .select('id, name, color, created_at')
    .single()

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }
  if (!data) {
    return { error: 'That tag is no longer available.' }
  }

  return { tag: data as Tag }
}

// Deleting a tag cascades: its topic_tags gates and member_tags assignments are removed
// by the FK on delete cascade (the UI confirm states the impact before this runs).
export async function deleteTag(input: {
  teacherId: string
  tagId: string
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('tags')
    .delete()
    .eq('id', input.tagId)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }

  return { success: true }
}
