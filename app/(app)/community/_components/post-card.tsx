import Image from 'next/image'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import type { PostWithRelations } from '@/lib/types'

export function PostCard({
  post,
  channelSlug,
}: {
  post: PostWithRelations
  channelSlug: string
}) {
  const firstImage = post.images[0]

  return (
    <Link
      href={`/community/${channelSlug}/${post.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="flex items-center gap-3">
        <Avatar
          url={post.author.avatar_url}
          name={post.author.display_name}
          size="md"
        />
        <span className="font-medium text-zinc-900">
          {post.author.display_name}
        </span>
        <span className="text-sm text-zinc-500">
          {formatRelativeTime(post.created_at)}
        </span>
      </div>

      {post.title && (
        <h2 className="mt-3 text-lg font-semibold text-zinc-900">
          {post.title}
        </h2>
      )}

      {post.body && (
        <p className="mt-1 line-clamp-3 text-zinc-700">{post.body}</p>
      )}

      {firstImage && (
        <div className="relative mt-3 aspect-video overflow-hidden rounded">
          <Image
            src={firstImage.url}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 border-t border-zinc-200 pt-3 text-sm text-zinc-500">
        <MessageSquare className="h-4 w-4" />
        {post.comment_count} comments
      </div>
    </Link>
  )
}
