import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { getAllMembers, searchPosts } from '@/lib/posts'
import { bodyToPlainText } from '@/lib/mentions'
import { formatRelativeTime } from '@/lib/format'
import { SearchBox } from '../_components/search-box'

// Community search results (posts + members). Static 'search' segment wins over the
// [channel] dynamic route. RLS scopes post results to this teacher's member-visible
// posts; member search filters the teacher's active roster by name.
export default async function CommunitySearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { slug } = await params
  const { q: rawQ } = await searchParams
  const q = (rawQ ?? '').trim()
  const basePath = `/t/${slug}/community`

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()

  const [posts, members] = q
    ? await Promise.all([
        searchPosts(teacher.id, q),
        getAllMembers(teacher.id),
      ])
    : [[], []]

  const ql = q.toLowerCase()
  const memberHits = q
    ? members.filter((m) => m.display_name.toLowerCase().includes(ql)).slice(0, 20)
    : []

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`${basePath}/announcements`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to community
      </Link>

      <div className="mb-6">
        <SearchBox basePath={basePath} defaultValue={q} />
      </div>

      {!q ? (
        <p className="py-10 text-center text-sm text-fg-muted">
          Type something to search posts and members.
        </p>
      ) : memberHits.length === 0 && posts.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-muted">
          No results for “{q}”.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {memberHits.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-fg-secondary">
                Members
              </h2>
              <div className="flex flex-col gap-1">
                {memberHits.map((m) => (
                  <Link
                    key={m.id}
                    href={`/t/${slug}/members/${m.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
                  >
                    <Avatar url={m.avatar_url} name={m.display_name} size="sm" />
                    <span className="text-sm font-medium text-fg">
                      {m.display_name}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {posts.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-fg-secondary">
                Posts
              </h2>
              <div className="flex flex-col gap-3">
                {posts.map((p) => {
                  const inner = (
                    <>
                      <div className="flex items-baseline justify-between gap-2">
                        {p.title ? (
                          <h3 className="truncate font-semibold text-fg">
                            {p.title}
                          </h3>
                        ) : (
                          <span className="text-sm font-medium text-fg">
                            {p.author_name}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-fg-muted">
                          {formatRelativeTime(p.created_at)}
                        </span>
                      </div>
                      {p.body && (
                        <p className="mt-1 line-clamp-2 text-sm text-fg-soft">
                          {bodyToPlainText(p.body)}
                        </p>
                      )}
                    </>
                  )
                  const cls = 'rounded-lg border border-line bg-surface p-4'
                  return p.channel_slug ? (
                    <Link
                      key={p.id}
                      href={`${basePath}/${p.channel_slug}/${p.id}`}
                      className={`${cls} transition-colors hover:bg-hover-subtle`}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={p.id} className={cls}>
                      {inner}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
