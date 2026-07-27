import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { getAllMembers } from '@/lib/posts'
import { getDmThreads } from '@/lib/dm'
import { formatRelativeTime } from '@/lib/format'
import { NewDm } from './_components/new-dm'

// Direct messages home: the caller's threads in THIS community + a "New message"
// picker. Membership is gated by the /t/[slug] layout; DMs are same-community only,
// so the picker lists this teacher's members (minus the caller).
export default async function MessagesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [threads, members] = await Promise.all([
    getDmThreads(teacher.id),
    getAllMembers(teacher.id),
  ])

  const pickable = members
    .filter((m) => m.id !== user?.id)
    .map((m) => ({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
    }))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-fg">Messages</h1>
        <NewDm slug={slug} teacherId={teacher.id} members={pickable} />
      </div>

      {threads.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">
            No conversations yet. Start one with “New message”.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/t/${slug}/messages/${t.id}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-hover-subtle"
            >
              <Avatar
                url={t.other.avatar_url}
                name={t.other.display_name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-fg">
                    {t.other.display_name}
                  </span>
                  {t.lastMessageAt && (
                    <span className="shrink-0 text-xs text-fg-muted">
                      {formatRelativeTime(t.lastMessageAt)}
                    </span>
                  )}
                </div>
                <p
                  className={`truncate text-sm ${
                    t.unread ? 'font-medium text-fg' : 'text-fg-muted'
                  }`}
                >
                  {t.lastMessage ?? 'No messages yet'}
                </p>
              </div>
              {t.unread && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-inverse"
                  aria-label="Unread"
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
