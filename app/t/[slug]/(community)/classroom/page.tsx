import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Settings } from 'lucide-react'
import { getInaccessibleTopicIds, getTopics } from '@/lib/classroom'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { TopicCard } from './_components/topic-card'

// Every topic behaves the same now (0037/0038 unified recordings into video
// lessons): each opens the generic topic view. Lifecycle (is_locked) and tag-gating
// still apply per topic.
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

  const [topics, isAdmin] = await Promise.all([
    getTopics(teacher.id),
    isTeacherAdmin(teacher.id),
  ])
  const visibleTopics = topics

  // Which topics is THIS member tag-locked out of? Sourced from can_access_topic (the
  // same fn the content_items RLS gate calls), so the lock label can't drift from the
  // wall.
  const tagLockedIds = await getInaccessibleTopicIds(
    visibleTopics.map((t) => t.id),
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">Classroom</h1>
        {isAdmin && (
          <Link
            href={`/t/${slug}/admin/classroom`}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            Classroom settings
          </Link>
        )}
      </div>

      {visibleTopics.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No topics yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTopics.map((topic) => {
            // is_locked (lifecycle "coming soon") wins if both apply.
            if (topic.is_locked) {
              return (
                <div key={topic.id}>
                  <TopicCard topic={topic} />
                </div>
              )
            }
            // Tag-locked: visible but non-clickable, distinct "Locked" caption.
            if (tagLockedIds.has(topic.id)) {
              return (
                <div key={topic.id}>
                  <TopicCard topic={topic} tagLocked />
                </div>
              )
            }
            return (
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
