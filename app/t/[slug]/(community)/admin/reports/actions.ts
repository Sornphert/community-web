'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ReportStatus } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>
type ActionResult = { data: true } | { error: string }

// [MT] SECURITY BOUNDARY — teacherId is attacker-controllable POST input. Re-check
// is_teacher_admin FOR THIS teacherId; the content_reports_update_admin RLS is the
// second gate. The admin render guard never runs for an action POST.
async function requireTeacherAdmin(
  teacherId: string,
): Promise<{ supabase: ServerClient; userId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: teacherId,
  })
  if (data !== true) return { error: 'Admins only.' }

  return { supabase, userId: user.id }
}

// Resolve a report: 'actioned' (admin dealt with it) or 'dismissed' (no action). Scoped
// to open rows of THIS teacher; stamps resolver + timestamp.
export async function resolveReport({
  teacherId,
  reportId,
  status,
}: {
  teacherId: string
  reportId: string
  status: Extract<ReportStatus, 'actioned' | 'dismissed'>
}): Promise<ActionResult> {
  if (status !== 'actioned' && status !== 'dismissed') {
    return { error: 'Invalid status.' }
  }

  const auth = await requireTeacherAdmin(teacherId)
  if ('error' in auth) return auth

  const { error } = await auth.supabase
    .from('content_reports')
    .update({
      status,
      resolved_by: auth.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .eq('teacher_id', teacherId)
    .eq('status', 'open')
  if (error) return { error: 'Could not update the report. Please try again.' }

  revalidatePath('/t/[slug]/admin/reports', 'page')
  return { data: true }
}
