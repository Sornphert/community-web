import Link from 'next/link'
import { getTopics } from '@/lib/classroom'
import { SHOW_RECORDINGS } from '@/lib/config'
import { TopicCard } from './_components/topic-card'

// The "Recordings" topic row is special-cased: instead of opening the generic
// topic view it links to the Classroom Recordings folder tree, and renders
// unlocked regardless of its is_locked flag. Every other topic (incl.
// 天命数据资料库) keeps its default behavior.
const RECORDINGS_TOPIC_ID = '52a53b67-e2d0-43bf-a2db-38083b8d801d'

export default async function ClassroomPage() {
  const topics = await getTopics()
  const visibleTopics = SHOW_RECORDINGS
    ? topics
    : topics.filter((t) => t.id !== RECORDINGS_TOPIC_ID)

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
            if (topic.id === RECORDINGS_TOPIC_ID) {
              return (
                <Link key={topic.id} href="/classroom/recordings">
                  <TopicCard topic={{ ...topic, is_locked: false }} />
                </Link>
              )
            }
            return topic.is_locked ? (
              <div key={topic.id}>
                <TopicCard topic={topic} />
              </div>
            ) : (
              <Link key={topic.id} href={`/classroom/topic/${topic.id}`}>
                <TopicCard topic={topic} />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
