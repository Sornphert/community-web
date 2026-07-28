import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopics } from '@/lib/classroom'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { ClassroomAdminGrid } from './_components/classroom-admin-grid'

// Unified classroom admin hub ("Classroom settings"). Mirrors the member classroom
// grid, but every card links to its management page and carries a delete; an
// "Add topic" tile creates one. Replaces the separate Recordings/Documents/Topics
// admin entry points.
export default async function ClassroomAdminPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isTeacherAdmin(teacher.id))) redirect(`/t/${slug}/classroom`)

  const topics = await getTopics(teacher.id)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Classroom settings</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Add or remove topics, then open a topic to manage its cover, access, and
        lessons.
      </p>

      <ClassroomAdminGrid
        slug={slug}
        teacherId={teacher.id}
        topics={topics.map((t) => ({
          id: t.id,
          name: t.name,
          cover_image_url: t.cover_image_url,
          is_locked: t.is_locked,
          is_recordings: t.is_recordings,
        }))}
      />
    </div>
  )
}
