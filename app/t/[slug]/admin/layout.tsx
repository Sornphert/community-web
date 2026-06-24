import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'

// [MT] Shared PAGE-RENDER guard for every /t/[slug]/admin/* route. Resolves the
// teacher from the slug, then gates on is_teacher_admin FOR THIS TEACHER (same RPC
// the *_admin RLS policies call, so the UI can't outrun the security layer).
//
// IMPORTANT: this layout protects RENDERS only. Server actions are POST endpoints
// reached independently of any layout — the layout never runs for an action
// invocation. So the per-action requireTeacherAdmin(teacherId) guards inside each
// admin actions.ts MUST stay; they are NOT made redundant by this layout. RLS is
// the real authority on writes regardless.
//
// isTeacherAdmin is cache()-deduped, so this layout + a page asking the same
// question for the same teacher = one RPC per request.
export default async function TeacherAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Belt-and-suspenders alongside the proxy + /t/[slug] layout gate. redirect()
  // throws NEXT_REDIRECT — keep it outside any try/catch.
  if (!user) {
    redirect('/login')
  }

  // cache()-deduped with the /t/[slug] layout's resolution. Defensive 404 if gone.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  // Non-admin (or admin of a DIFFERENT teacher) → bounced to this teacher's
  // Community. The per-teacher boundary the admin umbrella is responsible for.
  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/community`)
  }

  return <>{children}</>
}
