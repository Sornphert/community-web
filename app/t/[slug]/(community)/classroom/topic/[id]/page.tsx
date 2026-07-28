import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  canAccessTopic,
  getContentItems,
  getTopic,
  getTopicRequiredTagNames,
  getUserProgress,
} from '@/lib/classroom'
import { getLessonFolders, buildLessonTree } from '@/lib/lessons'
import { getTeacherBySlug } from '@/lib/teachers'
import { MemberLessonTree } from './_components/member-lesson-tree'

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }
  const basePath = `/t/${slug}/classroom`

  // Access is decided by can_access_topic (the same fn the content_items RLS gate calls),
  // NOT by whether the content list is empty — an entitled member viewing an ungated but
  // empty topic must still get "No content yet", never a lock.
  const [topic, canAccess] = await Promise.all([
    getTopic(id, teacher.id),
    canAccessTopic(id),
  ])

  if (!topic) {
    notFound()
  }

  if (topic.is_locked) {
    redirect(basePath)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to classroom
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold text-fg">{topic.name}</h1>
        {topic.description && (
          <p className="mt-2 whitespace-pre-wrap text-fg-soft">
            {topic.description}
          </p>
        )}
      </div>

      <div className="my-4 border-t border-line" />

      {canAccess ? (
        <TopicLessons
          topicId={id}
          teacherId={teacher.id}
          userId={user.id}
          basePath={basePath}
        />
      ) : (
        <TopicLocked topicId={id} teacherId={teacher.id} />
      )}
    </div>
  )
}

// Entitled view — the lessons list (or the genuine "No content yet" empty state). Items
// and progress are only fetched here, so a denied member never runs the RLS-denied reads.
async function TopicLessons({
  topicId,
  teacherId,
  userId,
  basePath,
}: {
  topicId: string
  teacherId: string
  userId: string
  basePath: string
}) {
  const [items, folders] = await Promise.all([
    getContentItems(topicId, teacherId),
    getLessonFolders(topicId, teacherId),
  ])
  const completedIds =
    items.length > 0
      ? await getUserProgress(
          userId,
          items.map((item) => item.id),
        )
      : new Set<string>()
  const tree = buildLessonTree(folders, items)

  return (
    <>
      <h2 className="mb-2 text-sm text-fg-muted">Lessons</h2>

      {items.length === 0 && folders.length === 0 ? (
        <p className="mt-4 text-fg-muted">No content yet</p>
      ) : (
        <MemberLessonTree
          tree={tree}
          basePath={basePath}
          completedIds={[...completedIds]}
        />
      )}
    </>
  )
}

// Tag-locked view — reached only when can_access_topic is false, i.e. the topic requires
// tags the member lacks. Tag names are for DISPLAY only (getTopicRequiredTagNames); they
// do not decide access.
async function TopicLocked({
  topicId,
  teacherId,
}: {
  topicId: string
  teacherId: string
}) {
  const tagNames = await getTopicRequiredTagNames(topicId, teacherId)

  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-10 text-center">
      <Lock className="h-8 w-8 text-fg-faint" />
      <p className="mt-3 font-medium text-fg">Locked</p>
      <p className="mt-1 text-sm text-fg-muted">
        {tagNames.length > 0 ? (
          <>
            Requires the{' '}
            <span className="font-medium text-fg-soft">
              {tagNames.join(', ')}
            </span>{' '}
            {tagNames.length === 1 ? 'tag' : 'tags'}.
          </>
        ) : (
          'This topic is not available on your current membership.'
        )}
      </p>
    </div>
  )
}
