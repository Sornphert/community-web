import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'

// Outer teacher shell: auth + teacher RESOLUTION only. The membership gate and the
// member nav/shell live in the (community)/ route group's layout — kept OUT of here so
// a future sibling (e.g. /t/[slug]/join, outside the group) can render for authenticated
// NON-members. Route groups are invisible in the URL, so every /t/[slug]/* path is
// unchanged. Resolution is cache()-deduped (getTeacherBySlug), so re-resolving in the
// (community) layout + each page is a single DB hit/request.
export default async function TeacherLayout({
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

  // Belt-and-suspenders alongside the proxy gate. redirect() throws NEXT_REDIRECT —
  // keep it outside any try/catch.
  if (!user) {
    redirect('/login')
  }

  // Unknown slug → 404. Open-directory RLS (teachers_select_all) lets any
  // authenticated user resolve the teacher row; membership is gated in (community)/.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  return <>{children}</>
}
