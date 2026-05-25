import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { formatRelativeTime } from '@/lib/format'
import type { PostWithFullRelations } from '@/lib/types'
import { CommentForm } from './comment-form'

export function PostDetail({
  post,
  channelSlug,
}: {
  post: PostWithFullRelations
  channelSlug: string
}) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`/community/${channelSlug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to community
      </Link>

      <article className="rounded-lg border border-zinc-200 bg-white p-4">
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
          <h1 className="mt-3 text-2xl font-semibold text-zinc-900">
            {post.title}
          </h1>
        )}

        {post.body && (
          <p className="mt-2 whitespace-pre-wrap text-zinc-700">{post.body}</p>
        )}

        {post.images.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {post.images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={image.id}
                src={image.url}
                alt=""
                className="max-w-full rounded"
              />
            ))}
          </div>
        )}
      </article>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">
        Comments ({post.comments.length})
      </h2>

      {post.comments.length === 0 ? (
        <p className="mt-2 text-zinc-500">No comments yet</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {post.comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar
                url={comment.author.avatar_url}
                name={comment.author.display_name}
                size="sm"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900">
                    {comment.author.display_name}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-zinc-700">
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <CommentForm postId={post.id} />
      </div>
    </div>
  )
}
