import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getContentItems, getTopic, getUserProgress } from '@/lib/classroom'
import { ContentRow } from './_components/content-row'

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [topic, items] = await Promise.all([
    getTopic(id),
    getContentItems(id),
  ])

  if (!topic) {
    notFound()
  }

  if (topic.is_locked) {
    redirect('/classroom')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const completedIds =
    items.length > 0
      ? await getUserProgress(
          user.id,
          items.map((item) => item.id),
        )
      : new Set<string>()

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/classroom"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to classroom
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-semibold text-zinc-900">{topic.name}</h1>
        {topic.description && (
          <p className="mt-2 whitespace-pre-wrap text-zinc-600">
            {topic.description}
          </p>
        )}
      </div>

      <div className="my-4 border-t border-zinc-200" />

      <h2 className="mb-2 text-sm text-zinc-500">Lessons</h2>

      {items.length === 0 ? (
        <p className="mt-4 text-zinc-500">No content yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link key={item.id} href={`/classroom/content/${item.id}`}>
              <ContentRow item={item} completed={completedIds.has(item.id)} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
