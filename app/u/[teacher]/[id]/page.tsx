import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Star } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { SOCIAL_ICON } from '@/app/(app)/_components/social-icons'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime } from '@/lib/format'
import { bodyToPlainText } from '@/lib/mentions'
import { SOCIAL_PLATFORMS, socialUrl } from '@/lib/social'
import {
  getPublicMemberHeader,
  getPublicMemberPosts,
} from '@/lib/public-profile'

// Per-profile social share preview: sharing a /u/ link shows the person's name,
// their community, and their avatar. Falls back to the root defaults if not found.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ teacher: string; id: string }>
}): Promise<Metadata> {
  const { teacher: teacherSlug, id } = await params
  const supabase = await createClient()
  const result = await getPublicMemberHeader(supabase, teacherSlug, id)
  if (!result) return {}

  const { header } = result
  const title = header.display_name
  const description = `${header.display_name} on ${header.teacher_name}`
  const image = header.avatar_url ?? undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image, alt: header.display_name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

// Public author profile reachable from the homepage public feed. Everything shown
// here comes from anon-granted SECURITY DEFINER RPCs (0017): the header requires an
// active membership, and the posts are the PUBLIC-only set (never private/community
// posts). Works logged-out.
export default async function PublicMemberProfilePage({
  params,
}: {
  params: Promise<{ teacher: string; id: string }>
}) {
  const { teacher: teacherSlug, id } = await params
  const supabase = await createClient()

  const result = await getPublicMemberHeader(supabase, teacherSlug, id)
  if (!result) {
    notFound()
  }
  const { header, teacherId } = result

  const posts = await getPublicMemberPosts(supabase, teacherId, id)

  // Renderable social links in platform order (drops anything unsafe/unsettable).
  const links = header.social_links ?? {}
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
        href="/home"
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to communities
      </Link>

      <section className="mt-4 flex flex-col items-center rounded-lg border border-line bg-surface p-6 text-center">
        <Avatar url={header.avatar_url} name={header.display_name} size="lg" />
        <h1 className="mt-3 text-xl font-semibold text-fg">
          {header.display_name}
        </h1>
        <span className="mt-1 text-xs text-fg-muted">{header.teacher_name}</span>
        {header.role === 'admin' && (
          <span className="mt-2 rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
            Admin
          </span>
        )}
        {header.bio && <p className="mt-2 text-fg-soft">{header.bio}</p>}

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

      {posts.length === 0 ? (
        <div className="mt-6 flex items-center justify-center">
          <p className="text-fg-muted">No public posts yet</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {posts.map((post, i) => (
            <article
              key={`${post.created_at}-${i}`}
              className="rounded-lg border border-line bg-surface p-4"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-fg">
                  {header.display_name}
                </span>
                <span className="flex items-center gap-2 text-sm text-fg-muted">
                  {post.featured && (
                    <Star className="h-3.5 w-3.5 fill-current" />
                  )}
                  {formatRelativeTime(post.created_at)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-soft line-clamp-4">
                {bodyToPlainText(post.body)}
              </p>
              {post.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.image_url}
                  alt=""
                  className="mt-3 max-h-96 w-full rounded-lg object-cover"
                />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
