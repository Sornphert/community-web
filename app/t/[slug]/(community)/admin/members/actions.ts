'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { MembershipRole } from '@/lib/types'

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

// Map the set_membership_role RPC envelope's error codes to clean admin-facing copy.
// The RPC ({success:false, error:<code>}) is THE authority for the last-admin invariant
// and the authz/target-scoping gates; this only translates its verdict.
function mapRoleError(code: string | undefined): string {
  switch (code) {
    case 'last_admin':
      return "You can't demote the last admin. Promote another member to admin first."
    case 'forbidden':
      return 'Admins only.'
    case 'not_a_member':
      return 'That member is no longer available.'
    case 'not_authenticated':
      return 'You must be signed in.'
    case 'invalid_role':
    default:
      return 'Could not change the role. Please try again.'
  }
}

// Promote a member to admin or demote an admin to member. memberships is write-less to
// authenticated, so the flip goes through the set_membership_role SECURITY DEFINER RPC —
// which re-derives the caller from auth.uid(), re-checks is_teacher_admin(teacherId), and
// enforces the last-admin invariant transactionally. requireTeacherAdmin here is
// belt-and-suspenders (the layout render-guard never runs for an action POST); the RPC is
// the real gate. teacherId/profileId are attacker-controllable POST input — never trusted.
export async function setMembershipRole(input: {
  teacherId: string
  profileId: string
  newRole: MembershipRole
}): Promise<{ error?: string; success?: true }> {
  if (!input.profileId) {
    return { error: 'Missing member.' }
  }
  if (input.newRole !== 'member' && input.newRole !== 'admin') {
    return { error: 'Invalid role.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { data, error } = await auth.supabase.rpc('set_membership_role', {
    p_teacher_id: input.teacherId,
    p_profile_id: input.profileId,
    p_new_role: input.newRole,
  })

  // A transport/SQL error (function missing, etc.) is a hard failure, distinct from the
  // RPC's own {success:false} verdict envelope.
  if (error) {
    return { error: 'Could not change the role. Please try again.' }
  }

  const result = data as { success: boolean; error?: string } | null
  if (!result?.success) {
    return { error: mapRoleError(result?.error) }
  }

  // Both the roster (Admin pill) and the detail header reflect role.
  revalidatePath('/t/[slug]/admin/members', 'page')
  revalidatePath('/t/[slug]/admin/members/[id]', 'page')
  return { success: true }
}

// Map the set_membership_status RPC envelope's error codes to admin-facing copy. NOTE:
// 'not_pending' is deliberately NOT handled here — it signals a benign concurrent-resolution
// race (another admin already approved/denied this request), which the caller surfaces as a
// quiet refresh via { alreadyHandled }, not a red error. Only the hard-denial codes flow
// through this map.
function mapStatusError(code: string | undefined): string {
  switch (code) {
    case 'forbidden':
      return 'Admins only.'
    case 'not_authenticated':
      return 'You must be signed in.'
    case 'invalid_status':
    default:
      return 'Could not update the request. Please try again.'
  }
}

// Approve (newStatus 'active') or deny (newStatus 'revoked') a PENDING join request.
// memberships is write-less to authenticated, so the transition goes through the
// set_membership_status SECURITY DEFINER RPC (0008) — which re-derives the caller from
// auth.uid(), re-checks is_teacher_admin(teacherId), whitelists the target status, and only
// ever transitions rows OUT of pending, transactionally. requireTeacherAdmin here is
// belt-and-suspenders (the layout render-guard never runs for an action POST); the RPC is the
// real gate. teacherId/profileId/newStatus are attacker-controllable POST input — never trusted.
export async function setPendingMembershipStatus(input: {
  teacherId: string
  profileId: string
  newStatus: 'active' | 'revoked'
}): Promise<{ error?: string; success?: true; alreadyHandled?: true }> {
  if (!input.profileId) {
    return { error: 'Missing member.' }
  }
  if (input.newStatus !== 'active' && input.newStatus !== 'revoked') {
    return { error: 'Invalid status.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { data, error } = await auth.supabase.rpc('set_membership_status', {
    p_teacher_id: input.teacherId,
    p_profile_id: input.profileId,
    p_new_status: input.newStatus,
  })

  // A transport/SQL error (function missing, etc.) is a hard failure, distinct from the
  // RPC's own {success:false} verdict envelope.
  if (error) {
    return { error: 'Could not update the request. Please try again.' }
  }

  const result = data as { success: boolean; error?: string } | null
  if (!result?.success) {
    // Benign race: the row was already resolved by another admin. Signal the caller to drop
    // the stale row with a quiet refresh instead of showing an alarming error.
    if (result?.error === 'not_pending') {
      return { alreadyHandled: true }
    }
    return { error: mapStatusError(result?.error) }
  }

  // The queue (pending section) and the active roster both live on the members list page.
  revalidatePath('/t/[slug]/admin/members', 'page')
  return { success: true }
}

// Map the revoke_membership RPC envelope's error codes to clean admin-facing copy. Same
// shape as mapRoleError — the RPC ({success:false, error:<code>}) is THE authority for the
// last-admin invariant and the authz/target-scoping gates; this only translates its verdict.
function mapRevokeError(code: string | undefined): string {
  switch (code) {
    case 'last_admin':
      return "You can't revoke the last admin. Promote another member to admin first."
    case 'forbidden':
      return 'Admins only.'
    case 'not_a_member':
      return 'That member is no longer available.'
    case 'not_authenticated':
      return 'You must be signed in.'
    default:
      return 'Could not revoke this member. Please try again.'
  }
}

// Revoke an ACTIVE member (active -> revoked, and demote to member in the same UPDATE).
// memberships is write-less to authenticated, so this goes through the revoke_membership
// SECURITY DEFINER RPC (0009) — which re-derives the caller from auth.uid(), re-checks
// is_teacher_admin(teacherId), and enforces the last-admin invariant transactionally (a
// revoke that would empty a teacher's active-admin set is rejected). requireTeacherAdmin here
// is belt-and-suspenders (the layout render-guard never runs for an action POST); the RPC is
// the real gate. teacherId/profileId are attacker-controllable POST input — never trusted.
export async function revokeMembership(input: {
  teacherId: string
  profileId: string
}): Promise<{ error?: string; success?: true }> {
  if (!input.profileId) {
    return { error: 'Missing member.' }
  }

  const auth = await requireTeacherAdmin(input.teacherId)
  if ('error' in auth) return auth

  const { data, error } = await auth.supabase.rpc('revoke_membership', {
    p_teacher_id: input.teacherId,
    p_profile_id: input.profileId,
  })

  // A transport/SQL error (function missing, etc.) is a hard failure, distinct from the
  // RPC's own {success:false} verdict envelope.
  if (error) {
    return { error: 'Could not revoke this member. Please try again.' }
  }

  const result = data as { success: boolean; error?: string } | null
  if (!result?.success) {
    return { error: mapRevokeError(result?.error) }
  }

  // The roster loses the now-revoked member; the detail page will 404 (getMemberProfile
  // returns null for a non-active member), so the caller navigates away to the roster.
  revalidatePath('/t/[slug]/admin/members', 'page')
  revalidatePath('/t/[slug]/admin/members/[id]', 'page')
  return { success: true }
}
