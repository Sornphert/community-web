'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Map the request_membership envelope's error codes to member-facing copy.
//   not_authenticated — session lost mid-request (the RPC re-derives auth.uid()).
//   unknown_teacher   — the teacher was resolved by getTeacherBySlug moments ago, so
//                       this only fires on a delete race. Keep it GENERIC (the page is
//                       branded for that teacher; "teacher not found" would be confusing).
function mapRequestError(code: string | undefined): string {
  switch (code) {
    case 'not_authenticated':
      return 'You must be signed in.'
    case 'unknown_teacher':
    default:
      return 'Something went wrong — please refresh and try again.'
  }
}

// A logged-in NON-member (or a revoked member) requests to join this teacher. Unlike the
// admin actions, this does NOT requireTeacherAdmin — the caller is by definition not an
// admin (often not even a member). Authorization is the RPC's job: request_membership is a
// SECURITY DEFINER function granted to `authenticated` that re-derives the caller from
// auth.uid() and self-scopes the write, so teacherId (attacker-controllable POST input) can
// only ever create/flip the CALLER's own row. The getUser() check here is a thin defensive
// gate; the RPC returns not_authenticated regardless.
export async function requestToJoin(input: {
  slug: string
  teacherId: string
  // The invite token from the /join/[token] link. Verified server-side so a member
  // can't request access to a community by guessing its slug — only a valid invite
  // link works.
  token: string
}): Promise<{ error?: string; success?: true }> {
  if (!input.teacherId || !input.token) {
    return { error: 'This invite link is invalid.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  // Gate on the invite token (SECURITY DEFINER check; the token table is unreadable
  // to clients). Mismatch → this wasn't a real invite link for this community.
  const { data: tokenOk, error: tokenErr } = await supabase.rpc(
    'join_token_matches',
    { p_teacher_id: input.teacherId, p_token: input.token },
  )
  if (tokenErr || tokenOk !== true) {
    return { error: 'This invite link is invalid or has expired.' }
  }

  const { data, error } = await supabase.rpc('request_membership', {
    p_teacher_id: input.teacherId,
    p_source: 'join_link',
  })

  // A transport/SQL error (function missing, etc.) is a hard failure, distinct from the
  // RPC's own {success:false} verdict envelope.
  if (error) {
    return { error: 'Something went wrong — please refresh and try again.' }
  }

  const result = data as { success: boolean; error?: string } | null
  if (!result?.success) {
    return { error: mapRequestError(result?.error) }
  }

  // Flip the join page to its pending state. The button also router.refresh()es.
  revalidatePath(`/join/${input.token}`, 'page')
  return { success: true }
}
