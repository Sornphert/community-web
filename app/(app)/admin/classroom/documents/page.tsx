import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopics } from '@/lib/classroom'
import { DocumentLessonForm } from './_components/document-lesson-form'

export default async function AdminDocumentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/community')

  const topics = await getTopics()

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900">
        Classroom Documents
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Upload a PDF or image as a document lesson into a topic.
      </p>

      <DocumentLessonForm topics={topics} />
    </div>
  )
}
