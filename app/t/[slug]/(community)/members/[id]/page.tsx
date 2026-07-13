import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { SOCIAL_ICON } from '@/app/(app)/_components/social-icons'
import { formatRelativeTime } from '@/lib/format'
import { bodyToPlainText } from '@/lib/mentions'
import { getTeacherBySlug } from '@/lib/teachers'
import { getMemberProfile } from '@/lib/posts'
import { SOCIAL_PLATFORMS, socialUrl } from '@/lib/social'

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  // [MT] Scoped to THIS teacher: returns null unless the target is an active member
  // here (members of other teachers / revoked / tombstoned are not viewable), and
  // their posts are scoped to teacher_id. Badge reads their role in this teacher.
  const member = await getMemberProfile(id, teacher.id)
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
        href={`/t/${slug}/members`}
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
        {member.role === 'admin' && (
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
          {member.posts.map((post) => {
            const inner = (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-fg">
                    {member.display_name}
                  </span>
                  <span className="text-sm text-fg-muted">
                    {formatRelativeTime(post.created_at)}
                  </span>
                </div>
                {post.title && (
                  <h2 className="mt-2 font-semibold text-fg">{post.title}</h2>
                )}
                {post.body && (
                  <p className="mt-1 line-clamp-1 text-sm text-fg-soft">
                    {bodyToPlainText(post.body)}
                  </p>
                )}
              </>
            )
            const cardClass = 'rounded-lg border border-line bg-surface p-4'

            // [MT] Post URL lives under its channel: /t/{slug}/community/{channel}/{id}.
            // Unassigned posts (null channel) have no channel route → non-clickable.
            return post.channel_slug ? (
              <Link
                key={post.id}
                href={`/t/${slug}/community/${post.channel_slug}/${post.id}`}
                className={`${cardClass} hover:bg-hover-subtle`}
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
