import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { getDmThread } from '@/lib/dm'
import { ThreadView } from '../_components/thread-view'

// One DM conversation. RLS scopes getDmThread to threads the caller is in, so a
// non-participant (or bad id) resolves to null → 404.
export default async function DmThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>
}) {
  const { slug, threadId } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const thread = await getDmThread(threadId)
  if (!thread) notFound()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <Link
          href={`/t/${slug}/messages`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
          aria-label="Back to messages"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Link
          href={`/t/${slug}/members/${thread.other.id}`}
          className="flex items-center gap-2"
        >
          <Avatar
            url={thread.other.avatar_url}
            name={thread.other.display_name}
            size="sm"
          />
          <span className="font-medium text-fg">
            {thread.other.display_name}
          </span>
        </Link>
      </div>

      <ThreadView
        threadId={thread.id}
        meId={user.id}
        initialMessages={thread.messages}
      />
    </div>
  )
}
