import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTopics } from '@/lib/classroom'
import { getTeacherBySlug } from '@/lib/teachers'
import { SHOW_RECORDINGS } from '@/lib/config'
import { TopicCard } from './_components/topic-card'

// The "Recordings" topic row is special-cased: instead of opening the generic
// topic view it links to the Classroom Recordings folder tree, and renders
// unlocked regardless of its is_locked flag. Every other topic keeps its default
// behavior. [MT] The single-tenant hardcoded UUID is gone — the recordings topic
// is now identified per-teacher by topic.is_recordings.
export default async function ClassroomPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }
  const basePath = `/t/${slug}/classroom`

  const topics = await getTopics(teacher.id)
  const visibleTopics = SHOW_RECORDINGS
    ? topics
    : topics.filter((t) => !t.is_recordings)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Classroom</h1>

      {visibleTopics.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No topics yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTopics.map((topic) => {
            if (topic.is_recordings) {
              return (
                <Link key={topic.id} href={`${basePath}/recordings`}>
                  <TopicCard topic={{ ...topic, is_locked: false }} />
                </Link>
              )
            }
            return topic.is_locked ? (
              <div key={topic.id}>
                <TopicCard topic={topic} />
              </div>
            ) : (
              <Link key={topic.id} href={`${basePath}/topic/${topic.id}`}>
                <TopicCard topic={topic} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
