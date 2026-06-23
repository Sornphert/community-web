import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopics } from '@/lib/classroom'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { TopicCoverRow } from './_components/topic-cover-row'

export default async function AdminTopicCoversPage({
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

  const topics = await getTopics(teacher.id)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Topic Covers</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Set or change the cover image shown on each classroom topic card.
      </p>

      {topics.length === 0 ? (
        <p className="text-sm text-fg-muted">No topics yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {topics.map((topic) => (
            <li key={topic.id}>
              <TopicCoverRow topic={topic} teacherId={teacher.id} uid={user.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
