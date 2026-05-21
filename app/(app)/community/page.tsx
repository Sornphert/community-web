import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getFeedPosts } from '@/lib/posts'
import { PostCard } from './_components/post-card'

export default async function CommunityPage() {
  const posts = await getFeedPosts()

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Community</h1>
        <Link
          href="/community/new"
          className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          <Plus className="h-4 w-4" />
          New Post
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-zinc-500">No posts yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}
