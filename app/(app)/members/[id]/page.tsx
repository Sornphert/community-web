import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { SOCIAL_ICON } from '@/app/(app)/_components/social-icons'
import { formatRelativeTime } from '@/lib/format'
import { bodyToPlainText } from '@/lib/mentions'
import { createClient } from '@/lib/supabase/server'
import { getMemberProfile } from '@/lib/posts'
import { SOCIAL_PLATFORMS, socialUrl } from '@/lib/social'

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/community')

  const { id } = await params
  const member = await getMemberProfile(id)

  if (!member) {
    notFound()
  }

  // Build renderable social links in platform order. `platform` (the entry key)
  // is what drives the URL — never the route `id` (the member's user id).
  // socialUrl returns null for anything unsafe/unsettable (e.g. a website value
  // without an http(s) scheme), so those are dropped.
  const links = member.social_links ?? {}
  const socialEntries = SOCIAL_PLATFORMS.flatMap(({ id: platform, label }) => {
    const handle = links[platform]
    if (!handle) return []
    const href = socialUrl(platform, handle)
    if (!href) return []
    return [{ platform, label, href }]
  })

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/members"
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to members
      </Link>

      <section className="mt-4 flex flex-col items-center rounded-lg border border-line bg-surface p-6 text-center">
        <Avatar
          url={member.avatar_url}
          name={member.display_name}
          size="lg"
        />
        <h1 className="mt-3 text-xl font-semibold text-fg">
          {member.display_name}
        </h1>
        {member.is_admin && (
          <span className="mt-2 rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
            Admin
          </span>
        )}
        {member.bio && <p className="mt-2 text-fg-soft">{member.bio}</p>}

        {socialEntries.length > 0 && (
          <div className="mt-3 flex items-center justify-center gap-4">
            {socialEntries.map(({ platform, label, href }) => {
              const Icon = SOCIAL_ICON[platform]
              return (
                <a
                  key={platform}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  <Icon className="h-5 w-5" />
                </a>
              )
            })}
          </div>
        )}

        <div className="my-4 w-full border-t border-line" />

        <span className="self-start text-sm text-fg-muted">Recent posts</span>
      </section>

      {member.posts.length === 0 ? (
        <div className="mt-6 flex items-center justify-center">
          <p className="text-fg-muted">No posts yet</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {member.posts.map((post) => (
            <Link
              key={post.id}
              href={`/community/${post.id}`}
              className="rounded-lg border border-line bg-surface p-4 hover:bg-hover-subtle"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-fg">
                  {member.display_name}
                </span>
                <span className="text-sm text-fg-muted">
                  {formatRelativeTime(post.created_at)}
                </span>
              </div>
              {post.title && (
                <h2 className="mt-2 font-semibold text-fg">
                  {post.title}
                </h2>
              )}
              {post.body && (
                <p className="mt-1 line-clamp-1 text-sm text-fg-soft">
                  {bodyToPlainText(post.body)}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
