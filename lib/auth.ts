import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// Per-teacher authorization, resolved through the SAME Postgres functions the RLS
// policies call (has_membership / is_teacher_admin) — so the UI's notion of access
// can never drift from the security layer. Both are cache()-wrapped: one RPC per
// (teacherId) per request, deduped across the /t/[slug] layout, its pages, and any
// nested fetchers that ask the same question.
//
// The current user is implicit (the RPCs read auth.uid() from the request's JWT via
// the cookie-backed server client), so teacherId is the only cache key — correct,
// because the user is fixed within a single request.

// TRUE iff the current user has an ACTIVE membership for this teacher. has_membership
// filters status='active' in SQL, so a REVOKED member resolves to false (and is gated
// out by the /t/[slug] layout). Returns false for a null/unknown teacher ([R2]).
export const hasMembership = cache(
  async (teacherId: string): Promise<boolean> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('has_membership', {
      p_teacher_id: teacherId,
    })
    if (error) {
      throw new Error(`has_membership(${teacherId}) failed: ${error.message}`)
    }
    return data === true
  },
)

// TRUE iff the current user is an ACTIVE admin of this teacher (implies membership).
// Drives every admin affordance in the teacher shell; resolved for the specific
// teacher whose page is being rendered — never global, never another teacher's.
export const isTeacherAdmin = cache(
  async (teacherId: string): Promise<boolean> => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('is_teacher_admin', {
      p_teacher_id: teacherId,
    })
    if (error) {
      throw new Error(`is_teacher_admin(${teacherId}) failed: ${error.message}`)
    }
    return data === true
  },
)
