import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { hasMembership, isTeacherAdmin } from '@/lib/auth'
import { getChannels } from '@/lib/posts'
import { Sidebar } from '@/app/(app)/_components/sidebar'

// The per-teacher shell and the SINGLE tenancy seam. Resolution order:
//   slug → teacher (404 if unknown) → ACTIVE-membership gate (else → /home)
//        → admin role for THIS teacher → scoped channels → teacher-scoped Sidebar.
// Everything under /t/[slug] renders inside this; pages re-resolve teacherId via the
// cache()-wrapped getTeacherBySlug (one DB hit/request). Mirrors (app)/layout.tsx's
// auth posture; replaces its role for teacher-scoped routes.
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
  // authenticated user resolve the teacher row; membership is gated separately below.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  // Membership gate: ACTIVE membership only — has_membership filters status='active',
  // so a revoked member is treated as a non-member and bounced. Non-members → /home.
  const isMember = await hasMembership(teacher.id)
  if (!isMember) {
    redirect('/home')
  }

  // Role + channels resolved for THIS teacher (never global, never stale). isTeacherAdmin
  // uses the same RPC as the RLS, so the UI cannot surface more than the DB permits.
  const isAdmin = await isTeacherAdmin(teacher.id)
  const channels = await getChannels(teacher.id)

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar
        slug={slug}
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        channels={channels}
      />
      <main className="flex flex-1 flex-col bg-canvas p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
    </div>
  )
}
