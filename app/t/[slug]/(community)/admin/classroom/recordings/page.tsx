import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildFolderTree, getFolders, getRecordings } from '@/lib/recordings'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { AdminRecordingsTree } from './_components/admin-recordings-tree'

export default async function AdminRecordingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
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
    redirect(`/t/${slug}/classroom`)
  }

  const [folders, recordings] = await Promise.all([
    getFolders(teacher.id),
    getRecordings(teacher.id),
  ])
  const tree = buildFolderTree(folders, recordings)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">
        Manage Recordings
      </h1>
      <p className="mb-6 text-sm text-fg-muted">
        Create folders and recordings for the Classroom.
      </p>

      <AdminRecordingsTree tree={tree} teacherId={teacher.id} />
    </div>
  )
}
