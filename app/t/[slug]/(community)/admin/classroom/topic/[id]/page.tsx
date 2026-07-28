import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getTopic, getContentItems } from '@/lib/classroom'
import { getTeacherTags, getTopicTagIds } from '@/lib/tags'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { TopicCoverRow } from '../../topics/_components/topic-cover-row'
import { TopicTagsEditor } from '../../topics/_components/topic-tags-editor'
import { TopicNameEditor } from './_components/topic-name-editor'
import { ContentList } from './_components/content-list'
import { AddLesson } from './_components/add-lesson'

// One topic's management page — identical for every topic: rename, cover, access
// (tags), and lessons (documents + Bunny video uploads).
export default async function AdminTopicDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isTeacherAdmin(teacher.id))) redirect(`/t/${slug}/classroom`)

  const topic = await getTopic(id, teacher.id)
  if (!topic) notFound()

  const base = `/t/${slug}/admin/classroom`

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={base}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Classroom settings
      </Link>

      <div className="mb-6">
        <TopicNameEditor
          teacherId={teacher.id}
          topicId={topic.id}
          initialName={topic.name}
        />
      </div>

      <TopicContentSection
        slug={slug}
        teacherId={teacher.id}
        uid={user.id}
        topicId={topic.id}
        topic={topic}
      />
    </div>
  )
}

async function TopicContentSection({
  slug,
  teacherId,
  uid,
  topicId,
  topic,
}: {
  slug: string
  teacherId: string
  uid: string
  topicId: string
  topic: Awaited<ReturnType<typeof getTopic>>
}) {
  if (!topic) return null
  const [items, tags, attachedTagIds] = await Promise.all([
    getContentItems(topicId, teacherId),
    getTeacherTags(teacherId),
    getTopicTagIds(topicId, teacherId),
  ])

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-fg">Cover image</h2>
        <TopicCoverRow topic={topic} teacherId={teacherId} uid={uid} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-fg">Access</h2>
        <div className="rounded-lg border border-line bg-surface p-3">
          <TopicTagsEditor
            teacherId={teacherId}
            topicId={topicId}
            slug={slug}
            tags={tags}
            attachedTagIds={attachedTagIds}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-fg">Lessons</h2>
        <div className="mb-4">
          <ContentList
            teacherId={teacherId}
            items={items.map((i) => ({ id: i.id, title: i.title, type: i.type }))}
          />
        </div>
        <AddLesson teacherId={teacherId} uid={uid} topic={topic} />
      </section>
    </div>
  )
}
