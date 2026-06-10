import Link from 'next/link'
import { AlertCircle, ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getPlayerUrl } from '@/lib/bunny'
import { formatFileSize, formatRelativeTime } from '@/lib/format'
import type { PostWithFullRelations } from '@/lib/types'
import { CommentForm } from './comment-form'
import { LikeButton } from './like-button'

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

        {/* Optional Bunny video. Absent for posts with no video — renders nothing,
            so existing posts are unchanged. Mirrors the classroom player states. */}
        {post.video &&
          (post.video.video_status === 'ready' && post.video.video_id ? (
            <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg border border-zinc-200 bg-black">
              <iframe
                src={getPlayerUrl(post.video.video_id)}
                loading="lazy"
                style={{ border: 'none', width: '100%', height: '100%' }}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          ) : post.video.video_status === 'processing' ? (
            <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100">
              <p className="flex items-center gap-2 px-4 text-center text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Video is processing. Check back in a few minutes.
              </p>
            </div>
          ) : post.video.video_status === 'failed' ? (
            <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100">
              <p className="flex items-center gap-2 px-4 text-center text-sm text-zinc-500">
                <AlertCircle className="h-4 w-4" />
                Video unavailable.
              </p>
            </div>
          ) : null)}

        {post.attachments.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {post.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-2"
              >
                <FileText className="h-5 w-5 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatFileSize(attachment.file_size)}
                  </p>
                </div>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                >
                  Open
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center border-t border-zinc-200 pt-3 text-sm text-zinc-500">
          <LikeButton
            targetType="post"
            targetId={post.id}
            initialLikesCount={post.likes_count}
            initialLikedByCurrentUser={post.liked_by_current_user}
          />
        </div>
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
                <div className="mt-1">
                  <LikeButton
                    targetType="comment"
                    targetId={comment.id}
                    initialLikesCount={comment.likes_count}
                    initialLikedByCurrentUser={comment.liked_by_current_user}
                  />
                </div>
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
