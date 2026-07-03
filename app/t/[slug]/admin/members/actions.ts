'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// [MT] SECURITY BOUNDARY. teacherId arrives as a server-action argument — attacker-
// controllable POST input. This guard (re-checking is_teacher_admin FOR THIS teacherId),
// the member_tags_*_admin RLS WITH CHECK/USING, and the composite same-teacher FKs are THE
// authorization boundary. The admin/layout.tsx render guard NEVER runs for an action POST,
// so every action re-guards and every write re-scopes .eq('teacher_id', teacherId).
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

// Map the Postgres error codes a member_tags write can raise to clean denial copy — same
// shape as the tags manager (surface 1). A forged/raced tag_id OR a profile_id that isn't
// an active member of teacherId trips a composite same-teacher FK (23503) rather than
// writing; surface it as a denial instead of a 500. 23505 (PK dup = already assigned)
// never reaches here — assignMemberTag treats it as idempotent success before calling.
function mapWriteError(code: string | undefined, fallback: string): string {
  if (code === '23503') return 'That member or tag is no longer available.'
  return fallback
}

// Assign a tag to a member. The (profile_id, teacher_id) → memberships composite FK
// guarantees the target is a real member of THIS teacher — you cannot tag a non-member,
// a revoked member, or another teacher's member — and (tag_id, teacher_id) → tags pins
// the tag to the same tenant. The insert stamps teacher_id explicitly so both FKs
// re-verify against it.
export async function assignMemberTag(input: {
  teacherId: string
  profileId: string
  tagId: string
}): Promise<{ error?: string; success?: true }> {
  if (!input.profileId || !input.tagId) {
    return { error: 'Missing member or tag.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase.from('member_tags').insert({
    profile_id: input.profileId,
    tag_id: input.tagId,
    teacher_id: input.teacherId,
  })

  if (error) {
    // 23505 = composite PK (profile_id, tag_id) dup: already assigned. The desired end
    // state already holds, so treat it as success (idempotent, race-safe re-toggle).
    if (error.code !== '23505') {
      return { error: mapWriteError(error.code, error.message) }
    }
  }

  // Admin member route ONLY (dynamic-pattern form — no concrete slug/id needed).
  revalidatePath('/t/[slug]/admin/members/[id]', 'page')
  return { success: true }
}

// Remove a tag from a member. Scoped by teacher_id (belt-and-suspenders over
// member_tags_delete_admin RLS) so an admin of teacher X can never unassign teacher Y's
// row. A no-op delete (already unassigned / never existed) is success — the end state holds.
export async function removeMemberTag(input: {
  teacherId: string
  profileId: string
  tagId: string
}): Promise<{ error?: string; success?: true }> {
  if (!input.profileId || !input.tagId) {
    return { error: 'Missing member or tag.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('member_tags')
    .delete()
    .eq('profile_id', input.profileId)
    .eq('tag_id', input.tagId)
    .eq('teacher_id', input.teacherId)

  if (error) {
    return { error: mapWriteError(error.code, error.message) }
  }

  revalidatePath('/t/[slug]/admin/members/[id]', 'page')
  return { success: true }
}
