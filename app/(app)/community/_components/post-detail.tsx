import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getPlayerUrl, getThumbnailUrl } from '@/lib/bunny'
import { formatFileSize, formatRelativeTime } from '@/lib/format'
import type { PostWithFullRelations } from '@/lib/types'
import { CommentForm } from './comment-form'
import { LikeButton } from './like-button'
import { PostActions } from './post-actions'
import { PostVideoPlayer } from './post-video-player'

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
            {post.edited_at && <span className="ml-1">(edited)</span>}
          </span>
          {post.can_edit && (
            <div className="ml-auto">
              <PostActions
                postId={post.id}
                channelSlug={channelSlug}
                variant="detail"
              />
            </div>
          )}
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
            so existing posts are unchanged. Click-to-load: no stream until play. */}
        {post.video?.video_id && (
          <PostVideoPlayer
            playerUrl={getPlayerUrl(post.video.video_id)}
            posterUrl={
              post.video.video_thumbnail_url ??
              getThumbnailUrl(post.video.video_id)
            }
            status={post.video.video_status}
          />
        )}

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
