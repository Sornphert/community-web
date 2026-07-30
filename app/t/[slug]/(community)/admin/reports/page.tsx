import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getReports } from '@/lib/moderation'
import type { ReportStatus } from '@/lib/types'
import { ReportsQueue } from './_components/reports-queue'

// Admin moderation queue. Members report posts/comments/users; this is where their
// teacher's admins review and resolve them. Tab via ?status= (open by default).
export default async function AdminReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const { slug } = await params
  const { status: statusParam } = await searchParams

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }
  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/community`)
  }

  const status: ReportStatus =
    statusParam === 'actioned' || statusParam === 'dismissed'
      ? statusParam
      : 'open'

  const reports = await getReports(teacher.id, slug, status)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Reports</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Posts, comments, and members your community flagged for review. Resolving a
        report doesn’t delete anything — use the linked content’s own controls to act.
      </p>

      <ReportsQueue
        teacherId={teacher.id}
        slug={slug}
        status={status}
        reports={reports}
      />
    </div>
  )
}
