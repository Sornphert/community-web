import Link from 'next/link'
import { Avatar } from '@/app/(app)/_components/avatar'
import { SOCIAL_ICON } from '@/app/(app)/_components/social-icons'
import { formatRelativeTime } from '@/lib/format'
import { bodyToPlainText } from '@/lib/mentions'
import { SOCIAL_PLATFORMS, socialUrl } from '@/lib/social'
import { FollowControls } from '../members/[id]/_components/follow-controls'
import type { SocialLinks } from '@/lib/types'
import type { FollowStateWithLists } from '@/lib/follows'

// A post as rendered by the profile view: link target is precomputed as `href`
// (null = non-clickable), so this component is link-agnostic and works for a
// single-teacher profile AND the cross-teacher global profile.
export type ProfilePost = {
  id: string
  title: string | null
  body: string
  created_at: string
  href: string | null
}

// The profile CARD + recent posts, shared by a member's public profile
// (/t/[slug]/members/[id]), your own in-teacher profile tab (/t/[slug]/profile), and
// the global /profile. The differing top chrome (back link vs. settings gear) is
// rendered by each page ABOVE this. `viewerId` drives the follow button (hidden on
// your own profile). Identity fields are passed flat so a caller can source them from
// either a teacher-scoped MemberWithPosts or the global profiles row.
export function MemberProfileView({
  targetId,
  displayName,
  avatarUrl,
  bio,
  socialLinks,
  roleLabel,
  posts,
  follow,
  viewerId,
  memberBasePath,
}: {
  targetId: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  socialLinks: SocialLinks
  // e.g. "Admin", or null for no badge (also null on the global, teacher-agnostic view).
  roleLabel: string | null
  posts: ProfilePost[]
  follow: FollowStateWithLists
  viewerId: string | null
  // Teacher-shell base (e.g. "/t/johnson") so the follow-list rows can link to member
  // pages; omitted on the global profile.
  memberBasePath?: string
}) {
  // Build renderable social links in platform order; drop anything unsafe/unset.
  const links = socialLinks ?? {}
  const socialEntries = SOCIAL_PLATFORMS.flatMap(({ id: platform, label }) => {
    const handle = links[platform]
    if (!handle) return []
    const href = socialUrl(platform, handle)
    if (!href) return []
    return [{ platform, label, href }]
  })

  return (
    <>
      <section className="mt-4 flex flex-col items-center rounded-lg border border-line bg-surface p-6 text-center">
        <Avatar url={avatarUrl} name={displayName} size="lg" />
        <h1 className="mt-3 text-xl font-semibold text-fg">{displayName}</h1>
        {roleLabel && (
          <span className="mt-2 rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
            {roleLabel}
          </span>
        )}
        {bio && <p className="mt-2 text-fg-soft">{bio}</p>}

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

        <FollowControls
          targetId={targetId}
          isOwnProfile={viewerId === targetId}
          initialIsFollowing={follow.isFollowing}
          initialFollowers={follow.followers}
          initialFollowing={follow.following}
          followersList={follow.followersList}
          followingList={follow.followingList}
          memberBasePath={memberBasePath}
        />

        <div className="my-4 w-full border-t border-line" />

        <span className="self-start text-sm text-fg-muted">Recent posts</span>
      </section>

      {posts.length === 0 ? (
        <div className="mt-6 flex items-center justify-center">
          <p className="text-fg-muted">No posts yet</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {posts.map((post) => {
            const inner = (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-fg">
                    {displayName}
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

            return post.href ? (
              <Link
                key={post.id}
                href={post.href}
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
    </>
  )
}
