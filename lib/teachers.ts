import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type {
  DirectoryTeacher,
  MembershipRole,
  Teacher,
  TeacherWithRole,
} from '@/lib/types'

// Resolve a teacher by its URL slug — the entry point for every /t/[slug] render.
// cache()-wrapped so the layout (gate + sidebar) and every page underneath share a
// single lookup per request: the slug is carried in the URL and re-resolved per page
// rather than threaded through props/context. Returns null for an unknown slug so the
// layout can notFound(). The teachers_select_all RLS lets ANY authenticated user
// resolve the row (open directory) — membership is gated separately in the layout.
export const getTeacherBySlug = cache(
  async (slug: string): Promise<Teacher | null> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to load teacher: ${error.message}`)
    }

    return (data as Teacher | null) ?? null
  },
)

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

// The full teacher directory, for the /home page (anon + authed). RLS opens
// teachers SELECT to authenticated (teachers_select_all) AND anon (teachers_select_anon),
// so this returns every teacher on BOTH paths.
//
// EXPLICIT column list, NOT select('*'): anon's column grant (migration 0002) covers
// only (id, slug, name, cover_url, logo_url, description) — a '*' select would try to
// read created_at and throw for logged-out viewers. The directory needs only these
// columns, so the explicit list is the single anon-safe code path for both audiences.
//
// member_count is a placeholder 0 here; the page overlays the real count from
// getTeacherMemberCounts() (sourced via RPC, not a memberships SELECT).
export async function getAllTeachers(): Promise<DirectoryTeacher[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teachers')
    .select('id, slug, name, cover_url, logo_url, description')
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to load teachers: ${error.message}`)
  }

  type Row = Omit<DirectoryTeacher, 'member_count'>

  return ((data ?? []) as Row[]).map((row) => ({ ...row, member_count: 0 }))
}

// Per-teacher ACTIVE member counts, from the teacher_member_counts() RPC (a
// SECURITY DEFINER aggregate granted to anon + authenticated, so it works on both
// paths). Returns a Map<teacher_id, count> for the page to overlay onto the cards.
//
// NEVER throws and never blocks the directory: on RPC error or empty result it
// returns an EMPTY Map, so cards simply render 0 for any teacher not present.
export async function getTeacherMemberCounts(): Promise<Map<string, number>> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('teacher_member_counts')
  if (error || !data) {
    return new Map()
  }

  const counts = new Map<string, number>()
  for (const row of data as { teacher_id: string; member_count: number }[]) {
    counts.set(row.teacher_id, Number(row.member_count))
  }
  return counts
}
