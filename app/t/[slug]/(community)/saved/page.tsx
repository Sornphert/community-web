import { notFound } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { getTeacherBySlug } from '@/lib/teachers'
import { getChannels, getSavedPosts } from '@/lib/posts'
import { PostCard } from '../community/_components/post-card'

// A member's saved (bookmarked) posts for THIS teacher, newest-saved first.
export default async function SavedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) notFound()

  const basePath = `/t/${slug}/community`
  const [posts, channels] = await Promise.all([
    getSavedPosts(teacher.id),
    getChannels(teacher.id),
  ])
  const slugById = new Map(channels.map((c) => [c.id, c.slug]))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Saved</h1>

      {posts.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-12 text-center">
          <Bookmark className="h-8 w-8 text-fg-muted" />
          <p className="mt-3 text-sm font-medium text-fg">No saved posts yet</p>
          <p className="mt-1 text-sm text-fg-muted">
            Tap the bookmark on any post to save it here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => {
            const channelSlug = post.channel_id
              ? slugById.get(post.channel_id)
              : undefined
            if (!channelSlug) return null
            return (
              <PostCard
                key={post.id}
                post={post}
                channelSlug={channelSlug}
                basePath={basePath}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
