'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Channel, WeekGroup } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Shared admin guard (mirrors admin/classroom/documents/actions.ts). The
// DB-level enabler is the channels_insert_admin RLS policy; this is the
// belt-and-suspenders guard so a non-admin never reaches the insert.
async function requireAdmin(): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_admin) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

// Create the next "month" (week_groups row). Manually named; ordered by a hidden
// position sort key (max+1, displayed DESC = newest on top). Empty name falls
// back to a NON-COUNTING constant ('Untitled month') — deliberately not derived
// from a month count/position, which a later month delete would desync/collide.
// Duplicate names are allowed (same as classroom_folders).
export async function addMonth(
  name: string,
): Promise<{ error?: string; month?: WeekGroup }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  const { data: maxRow, error: maxError } = await supabase
    .from('week_groups')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxError) {
    return { error: maxError.message }
  }

  const position = (maxRow?.position ?? -1) + 1
  const finalName = name.trim() || 'Untitled month'

  const { data, error } = await supabase
    .from('week_groups')
    .insert({ name: finalName, position })
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/weekly')
  return { month: data as WeekGroup }
}

// Create the next week INSIDE a month: a channels row with section='weekly',
// post_permission='admin_only', group_id = the month.
//
// IMPORTANT — week_number and slug are INDEPENDENT:
//   • week_number = the PER-MONTH sort key (max within this month + 1, starts at
//     1). Fixed for the row; never bumped on a retry.
//   • slug        = a GLOBAL unique id ('week-' + globalN, where globalN seeds
//     from the global weekly count). channels.slug is globally UNIQUE across ALL
//     channels, so on a 23505 collision we bump ONLY the slug suffix (keeping
//     week_number + group_id fixed) and retry.
export async function addWeek(
  groupId: string,
  name: string,
): Promise<{ error?: string; week?: Channel }> {
  const auth = await requireAdmin()
  if ('error' in auth) return auth
  const { supabase } = auth

  // The month must still exist (the FK would also reject, but this is a clearer
  // message than a raw 23503).
  const { data: group, error: groupError } = await supabase
    .from('week_groups')
    .select('id')
    .eq('id', groupId)
    .maybeSingle()
  if (groupError) {
    return { error: groupError.message }
  }
  if (!group) {
    return { error: 'That month no longer exists.' }
  }

  // week_number = per-month max + 1 (fixed for this row).
  const { data: maxWeekRow, error: maxWeekError } = await supabase
    .from('channels')
    .select('week_number')
    .eq('section', 'weekly')
    .eq('group_id', groupId)
    .order('week_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxWeekError) {
    return { error: maxWeekError.message }
  }
  const weekNumber = (maxWeekRow?.week_number ?? 0) + 1
  const finalName = name.trim() || `Week ${weekNumber}`

  // slug = global unique id. Seed from the global weekly count.
  const { count: weeklyCount, error: countError } = await supabase
    .from('channels')
    .select('id', { count: 'exact', head: true })
    .eq('section', 'weekly')
  if (countError) {
    return { error: countError.message }
  }

  const MAX_ATTEMPTS = 5
  let globalN = (weeklyCount ?? 0) + 1
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = `week-${globalN}`

    const { data, error } = await supabase
      .from('channels')
      .insert({
        slug,
        name: finalName,
        section: 'weekly',
        post_permission: 'admin_only',
        group_id: groupId,
        week_number: weekNumber,
      })
      .select('*')
      .single()

    if (!error) {
      revalidatePath('/weekly')
      revalidatePath(`/weekly/m/${groupId}`)
      return { week: data as Channel }
    }

    // 23505 = slug taken. Bump ONLY the global slug suffix; week_number +
    // group_id stay fixed (they are independent of slug).
    if (error.code === '23505') {
      globalN++
      continue
    }
    return { error: error.message }
  }

  return { error: 'Could not create the week, please try again.' }
}
