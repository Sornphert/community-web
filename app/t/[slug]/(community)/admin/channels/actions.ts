'use server'

import { createClient } from '@/lib/supabase/server'
import { MAX_CHANNEL_NAME_LEN } from '@/lib/channel-constants'
import type { Channel } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] SECURITY BOUNDARY. teacherId arrives as a server-action argument — i.e. it is
// attacker-controllable POST input. This guard (re-checking is_teacher_admin FOR THIS
// teacherId), the channels_*_admin RLS WITH CHECK/USING, and the composite FKs are THE
// authorization boundary. That a page "derived" teacherId from the slug is NOT a
// protection — the layout guards renders, not action POSTs. So every action re-guards,
// and every write also re-scopes .eq('teacher_id', teacherId) AND .eq('section','community')
// so no stray weekly row is ever reachable through this admin surface.
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

// Map the Postgres error codes these writes can raise to clean denial copy.
// 23505 = duplicate (teacher_id, slug) — mostly pre-handled by the slug-suffix retry in
// createChannel; a leftover here is a defensive fallback. 23503 on DELETE is the REAL
// guard: the posts→channels FK is NO ACTION, so deleting a channel with posts is blocked.
function mapWriteError(code: string | undefined, fallback: string): string {
  if (code === '23505') return 'A channel with that name already exists.'
  if (code === '23503') {
    return 'This channel still has posts. Move or delete them first.'
  }
  return fallback
}

// Derive the frozen URL slug from a display name: lowercase, hyphenate runs of
// non-alphanumerics, strip leading/trailing hyphens, truncate. Falls back to 'channel'
// for all-symbol / empty results (e.g. "!!!" or a name that strips to nothing). The slug
// is set ONCE at create and never changes on rename (URL-spine identifiers are immutable).
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return base || 'channel'
}

export async function createChannel(input: {
  teacherId: string
  name: string
  postPermission: 'all' | 'admin_only'
}): Promise<{ error?: string; channel?: Channel }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const name = input.name.trim()
  if (!name) {
    return { error: 'Enter a channel name.' }
  }
  if (name.length > MAX_CHANNEL_NAME_LEN) {
    return {
      error: `Channel name is too long (max ${MAX_CHANNEL_NAME_LEN} characters).`,
    }
  }
  const permission = input.postPermission === 'admin_only' ? 'admin_only' : 'all'

  // Append to the end: position = current max among this teacher's community channels + 1.
  const { data: last } = await auth.supabase
    .from('channels')
    .select('position')
    .eq('teacher_id', input.teacherId)
    .eq('section', 'community')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const position = (last?.position ?? -1) + 1

  // Slug-suffix retry: the display NAME stays exactly what the teacher typed; only the
  // slug gets a numeric suffix on a (teacher_id, slug) collision — general, general-2, …
  const baseSlug = slugify(name)
  for (let attempt = 0; attempt < 25; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`

    const { data, error } = await auth.supabase
      .from('channels')
      .insert({
        teacher_id: input.teacherId,
        slug,
        name,
        position,
        post_permission: permission,
        section: 'community',
      })
      .select('*')
      .single()

    if (!error) {
      return { channel: data as Channel }
    }
    // Only a slug collision is retryable; anything else is a real failure.
    if (error.code !== '23505') {
      return { error: mapWriteError(error.code, error.message) }
    }
  }

  return { error: 'Could not generate a unique channel URL. Try a different name.' }
}

export async function renameChannel(input: {
  teacherId: string
  channelId: string
  name: string
  postPermission: 'all' | 'admin_only'
}): Promise<{ error?: string; channel?: Channel }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const name = input.name.trim()
  if (!name) {
    return { error: 'Enter a channel name.' }
  }
  if (name.length > MAX_CHANNEL_NAME_LEN) {
    return {
      error: `Channel name is too long (max ${MAX_CHANNEL_NAME_LEN} characters).`,
    }
  }
  const permission = input.postPermission === 'admin_only' ? 'admin_only' : 'all'

  // Update name + post_permission ONLY — slug is frozen (immutable URL spine). Scoped by
  // teacher_id + section='community' so an admin of teacher X can never touch teacher Y's
  // channel nor a stray weekly row (belt-and-suspenders over channels_update_admin RLS).
  // Flipping all→admin_only governs NEW posts only (posts_insert_channel_permitted checks
  // permission at INSERT); existing member-authored posts stay visible, owned, and editable.
  const { data, error } = await auth.supabase
    .from('channels')
    .update({ name, post_permission: permission })
    .eq('id', input.channelId)
    .eq('teacher_id', input.teacherId)
    .eq('section', 'community')
    .select('*')
    .single()

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }
  if (!data) {
    return { error: 'That channel is no longer available.' }
  }

  return { channel: data as Channel }
}

// Rewrite position = index for the given order. Does N scoped .update() calls (migration-
// free; no SECURITY DEFINER RPC). Each write is scoped to teacher_id + section='community',
// so a forged/partial orderedIds only ever touches this teacher's community rows, and any id
// not in that set updates zero rows (harmless). position has no unique constraint, so the DB
// is ALWAYS in a valid state — a partial failure just leaves positions possibly wrong, which
// a router.refresh() + retry fully heals. On any error we return { error } so the manager can
// refresh to real DB state and prompt a retry; nothing silently self-heals.
export async function reorderChannels(input: {
  teacherId: string
  orderedIds: string[]
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  for (let index = 0; index < input.orderedIds.length; index++) {
    const { error } = await auth.supabase
      .from('channels')
      .update({ position: index })
      .eq('id', input.orderedIds[index])
      .eq('teacher_id', input.teacherId)
      .eq('section', 'community')

    if (error) {
      return {
        error:
          'Reorder didn’t fully apply. The list has been refreshed — try again.',
      }
    }
  }

  return { success: true }
}

// DELETE is RESTRICT: the posts→channels FK is NO ACTION, so the DB blocks (23503) any
// delete of a channel that still has posts — this is the real guard, not the UI post-count.
// Scoped to teacher_id + section='community'.
export async function deleteChannel(input: {
  teacherId: string
  channelId: string
}): Promise<{ error?: string; success?: true }> {
  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('channels')
    .delete()
    .eq('id', input.channelId)
    .eq('teacher_id', input.teacherId)
    .eq('section', 'community')

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }

  return { success: true }
}
