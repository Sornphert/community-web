import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopics } from '@/lib/classroom'
import { getTeacherTags, getTopicTagIds } from '@/lib/tags'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { TopicCoverRow } from './_components/topic-cover-row'
import { TopicTagsEditor } from './_components/topic-tags-editor'

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
  // Teacher's tags once for the whole list; each topic's currently-required tag_ids for
  // toggle state. Both scoped to teacher.id (RLS + explicit .eq) — no cross-tenant bleed.
  const tags = await getTeacherTags(teacher.id)
  const topicTagIds = await Promise.all(
    topics.map((topic) => getTopicTagIds(topic.id, teacher.id)),
  )

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Topics</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Set the cover image and choose which tags each classroom topic requires.
      </p>

      {topics.length === 0 ? (
        <p className="text-sm text-fg-muted">No topics yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {topics.map((topic, i) => (
            <li key={topic.id} className="flex flex-col gap-2">
              <TopicCoverRow topic={topic} teacherId={teacher.id} uid={user.id} />
              <div className="rounded-lg border border-line bg-surface p-3">
                <TopicTagsEditor
                  teacherId={teacher.id}
                  topicId={topic.id}
                  slug={slug}
                  tags={tags}
                  attachedTagIds={topicTagIds[i]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
