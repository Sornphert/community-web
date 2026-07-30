import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import { bodyToPlainText } from '@/lib/mentions'
import { getFollowingFeed } from '@/lib/follows'
import { getTeacherBySlug } from '@/lib/teachers'

// [Following] The cross-teacher feed of recent posts by people you follow. Lives in
// the teacher-AGNOSTIC (app) shell because a follow spans communities. Post visibility
// is still membership-gated by RLS (getFollowingFeed relies on the posts policy), so
// this only shows posts in communities you're actually in.
export const metadata = { title: 'Following' }

export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const [posts, { from }] = await Promise.all([
    getFollowingFeed(),
    searchParams,
  ])

  // Context-aware back link: when the sidebar links here from inside a teacher shell it
  // passes `?from=<slug>`, so we return to THAT community instead of the app-wide /home
  // directory. We resolve the slug to a real teacher (guards against a bogus/stale param)
  // and only then honor it; otherwise fall back to Home.
  const fromTeacher = from ? await getTeacherBySlug(from) : null
  const backHref = fromTeacher
    ? `/t/${fromTeacher.slug}/community`
    : '/home'
  const backLabel = fromTeacher ? fromTeacher.name : 'Home'

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <h1 className="text-xl font-semibold text-fg">Following</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Recent posts from people you follow.
      </p>

      {posts.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-12 text-center">
          <Users className="h-8 w-8 text-fg-muted" />
          <p className="mt-3 text-sm font-medium text-fg">Nothing here yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Follow people from their profiles and their posts will show up here.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {posts.map((post) => {
            const inner = (
              <>
                <div className="flex items-center gap-3">
                  <Avatar
                    url={post.avatar_url}
                    name={post.display_name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {post.display_name}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {post.teacher_name} · {formatRelativeTime(post.created_at)}
                    </p>
                  </div>
                </div>
                {post.title && (
                  <h2 className="mt-2 font-semibold text-fg">{post.title}</h2>
                )}
                {post.body && (
                  <p className="mt-1 line-clamp-2 text-sm text-fg-soft">
                    {bodyToPlainText(post.body)}
                  </p>
                )}
              </>
            )
            const cardClass = 'rounded-lg border border-line bg-surface p-4'

            // Post lives under its channel; unassigned posts (null channel) have no
            // route, so render them non-clickable.
            return post.channel_slug ? (
              <Link
                key={post.id}
                href={`/t/${post.teacher_slug}/community/${post.channel_slug}/${post.id}`}
                className={`${cardClass} transition-colors hover:bg-hover-subtle`}
              >
                {inner}
              </Link>
            ) : (
              <div key={post.id} className={cardClass}>
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
