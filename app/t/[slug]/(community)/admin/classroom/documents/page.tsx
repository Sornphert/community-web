import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopics } from '@/lib/classroom'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { DocumentLessonForm } from './_components/document-lesson-form'

export default async function AdminDocumentsPage({
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

  // [MT] Per-teacher admin guard (the topics/content_items *_admin RLS is the real
  // enabler). A non-admin — or an admin of a DIFFERENT teacher — is bounced to this
  // teacher's classroom.
  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/classroom`)
  }

  const topics = await getTopics(teacher.id)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">
        Classroom Documents
      </h1>
      <p className="mb-6 text-sm text-fg-muted">
        Upload a PDF or image as a document lesson into a topic.
      </p>

      <DocumentLessonForm topics={topics} teacherId={teacher.id} uid={user.id} />
    </div>
  )
}
