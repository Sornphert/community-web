import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { MentionText } from '@/app/(app)/_components/mention-text'
import type { MentionMember } from '@/app/(app)/_components/mention-textarea'
import { getPlayerUrl, getThumbnailUrl } from '@/lib/bunny'
import { formatFileSize, formatRelativeTime } from '@/lib/format'
import type { PostWithFullRelations } from '@/lib/types'
import { CommentForm } from './comment-form'
import { CommentItem } from './comment-item'
import { LikeButton } from './like-button'
import { PostActions } from './post-actions'
import { PostVideoPlayer } from './post-video-player'

export function PostDetail({
  post,
  channelSlug,
  members = [],
  canMentionAll = false,
  basePath = '/community',
  backLabel = 'Back to community',
}: {
  post: PostWithFullRelations
  channelSlug: string
  // Mention-picker data threaded to the comment composer. Optional so the
  // /weekly tree can render without it.
  members?: MentionMember[]
  canMentionAll?: boolean
  // URL prefix + back-link label. Default to the Community feed; the /weekly tree
  // passes '/weekly' and the week's name (e.g. "第 1 周 · Week 1").
  basePath?: string
  backLabel?: string
}) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`${basePath}/${channelSlug}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <article className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <Avatar
            url={post.author.avatar_url}
            name={post.author.display_name}
            size="md"
          />
          <span className="font-medium text-fg">
            {post.author.display_name}
          </span>
          <span className="text-sm text-fg-muted">
            {formatRelativeTime(post.created_at)}
          </span>
          {post.can_edit && (
            <div className="ml-auto">
              <PostActions
                postId={post.id}
                channelSlug={channelSlug}
                basePath={basePath}
                variant="detail"
              />
            </div>
          )}
        </div>

        {post.title && (
          <h1 className="mt-3 text-2xl font-semibold text-fg">
            {post.title}
          </h1>
        )}

        {post.body && (
          <MentionText
            body={post.body}
            className="mt-2 block whitespace-pre-wrap text-fg-secondary"
          />
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

        {/* Optional Bunny videos, in position order (a post may hold several
            since 0017). Absent for posts with no video — renders nothing, so
            existing posts are unchanged. Click-to-load: no stream until play. */}
        {post.videos
          .filter((video) => video.video_id)
          .map((video) => (
            <PostVideoPlayer
              key={video.id}
              playerUrl={getPlayerUrl(video.video_id!)}
              posterUrl={
                video.video_thumbnail_url ?? getThumbnailUrl(video.video_id!)
              }
              status={video.video_status}
            />
          ))}

        {post.attachments.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {post.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-3 rounded-md border border-line px-3 py-2"
              >
                <FileText className="h-5 w-5 shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {formatFileSize(attachment.file_size)}
                  </p>
                </div>
                <a
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-strong"
                >
                  Open
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center border-t border-line pt-3 text-sm text-fg-muted">
          <LikeButton
            targetType="post"
            targetId={post.id}
            initialLikesCount={post.likes_count}
            initialLikedByCurrentUser={post.liked_by_current_user}
          />
        </div>
      </article>

      <h2 className="mt-8 text-lg font-semibold text-fg">
        Comments ({post.comments.length})
      </h2>

      {post.comments.length === 0 ? (
        <p className="mt-2 text-fg-muted">No comments yet</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {post.comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              members={members}
              canMentionAll={canMentionAll}
            />
          ))}
        </div>
      )}

      <div className="mt-6">
        <CommentForm
          postId={post.id}
          members={members}
          canMentionAll={canMentionAll}
        />
      </div>
    </div>
  )
}
