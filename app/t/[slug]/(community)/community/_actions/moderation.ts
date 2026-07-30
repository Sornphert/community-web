'use server'

import { createClient } from '@/lib/supabase/server'
import type { ReportTargetType } from '@/lib/types'

type ActionResult = { data: true } | { error: string }

// Member-facing: file a report against a post, comment, or user. Goes through the
// USER's client so RLS is the enforcement point — content_reports_insert_own requires
// reporter_id = auth.uid() AND has_membership(teacher_id), so a non-member or a forged
// reporter is rejected at the database. A duplicate OPEN report (unique partial index)
// is treated as idempotent success, not an error.
export async function reportContent({
  teacherId,
  targetType,
  targetId,
  reason,
}: {
  teacherId: string
  targetType: ReportTargetType
  targetId: string
  reason?: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Can't report yourself.
  if (targetType === 'user' && targetId === user.id) {
    return { error: "You can't report yourself." }
  }

  const trimmed = reason?.trim() || null

  const { error } = await supabase.from('content_reports').insert({
    teacher_id: teacherId,
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason: trimmed,
  })

  if (error) {
    // Unique partial index on (reporter, target) where status='open' → already reported.
    if (error.code === '23505') return { data: true }
    return { error: 'Could not submit the report. Please try again.' }
  }

  return { data: true }
}
