import { createClient } from '@/lib/supabase/server'
import type { MembershipRole, Teacher, TeacherWithRole } from '@/lib/types'

// The current user's ACTIVE memberships, joined to their teacher, for the
// "Your communities" section of the /home shell. Each result carries the user's
// role in that teacher. Returns [] when signed out (the layout already gates auth).
//
// The teacher embed uses the explicit FK hint (memberships → teachers via
// teacher_id) per the project convention — memberships also FKs profiles, so a
// bare `teachers(*)` could become ambiguous if more relationships are added.
export async function getMyMemberships(): Promise<TeacherWithRole[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('memberships')
    .select('role, teacher:teachers!teacher_id(*)')
    .eq('profile_id', user.id)
    .eq('status', 'active')

  if (error) {
    throw new Error(`Failed to load memberships: ${error.message}`)
  }

  type Row = { role: MembershipRole; teacher: Teacher | null }

  return ((data ?? []) as unknown as Row[])
    .filter((row): row is Row & { teacher: Teacher } => row.teacher !== null)
    .map((row) => ({ ...row.teacher, role: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// The full teacher directory, for the "Discover" section. RLS opens teachers
// SELECT to any authenticated user (teachers_select_all), so this returns every
// teacher; the page filters out the ones the user already belongs to.
export async function getAllTeachers(): Promise<Teacher[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load teachers: ${error.message}`)
  }

  return (data ?? []) as Teacher[]
}
