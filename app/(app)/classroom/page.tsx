import Link from 'next/link'
import { getTopics } from '@/lib/classroom'
import { TopicCard } from './_components/topic-card'

export default async function ClassroomPage() {
  const topics = await getTopics()

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">Classroom</h1>

      {topics.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-zinc-500">No topics yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {topics.map((topic) => (
            <Link key={topic.id} href={`/classroom/topic/${topic.id}`}>
              <TopicCard topic={topic} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
