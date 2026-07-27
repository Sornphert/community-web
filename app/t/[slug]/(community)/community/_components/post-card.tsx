import Image from 'next/image'
import Link from 'next/link'
import { MessageSquare, Paperclip } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getPlayerUrl, getThumbnailUrl } from '@/lib/bunny'
import { formatRelativeTime } from '@/lib/format'
import { bodyToPlainText } from '@/lib/mentions'
import type { PostWithRelations } from '@/lib/types'
import { AdminPostControls } from './admin-post-controls'
import { LikeButton } from './like-button'
import { PostActions } from './post-actions'
import { SaveButton } from './save-button'
import { PublicToggle } from './public-toggle'
import { PostVideoPlayer } from './post-video-player'

export function PostCard({
  post,
  channelSlug,
  basePath = '/community',
}: {
  post: PostWithRelations
  channelSlug: string
  // URL prefix for post links. Defaults to '/community'.
  basePath?: string
}) {
  const firstImage = post.images[0]
  // A ready/processing/failed video takes the media slot in place of the first
  // image. Player + poster URLs are built server-side (Bunny library id / CDN
  // host are not exposed to the client) and passed to the client player.
  const video = post.video?.video_id ? post.video : null

  return (
    <Link
      href={`${basePath}/${channelSlug}/${post.id}`}
      className="block rounded-lg border border-line bg-surface p-4"
    >
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
          {post.edited_at && <span className="ml-1">(edited)</span>}
        </span>
        {post.isAuthor && (
          <PublicToggle
            postId={post.id}
            isPublic={post.is_public}
            hiddenFromPublic={post.hidden_from_public}
          />
        )}
        {(post.viewerIsAdmin || post.can_edit) && (
          <div className="ml-auto flex items-center gap-2">
            {post.viewerIsAdmin && (
              <AdminPostControls
                postId={post.id}
                isPublic={post.is_public}
                hiddenFromPublic={post.hidden_from_public}
                featured={post.featured}
              />
            )}
            {post.can_edit && (
              <PostActions
                postId={post.id}
                channelSlug={channelSlug}
                basePath={basePath}
                variant="card"
              />
            )}
          </div>
        )}
      </div>

      {post.title && (
        <h2 className="mt-3 text-lg font-semibold text-fg">
          {post.title}
        </h2>
      )}

      {post.body && (
        <p className="mt-1 line-clamp-3 text-fg-secondary">
          {bodyToPlainText(post.body)}
        </p>
      )}

      {video ? (
        <PostVideoPlayer
          playerUrl={getPlayerUrl(video.video_id!)}
          posterUrl={video.video_thumbnail_url ?? getThumbnailUrl(video.video_id!)}
          status={video.video_status}
        />
      ) : (
        firstImage && (
          <div className="relative mt-3 aspect-video overflow-hidden rounded">
            <Image
              src={firstImage.url}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 672px"
            />
          </div>
        )
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-sm text-fg-muted">
        <LikeButton
          targetType="post"
          targetId={post.id}
          initialLikesCount={post.likes_count}
          initialLikedByCurrentUser={post.liked_by_current_user}
        />
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          {post.comment_count} comments
        </div>
        {post.attachments.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Paperclip className="h-4 w-4" />
            {post.attachments.length} PDF
          </div>
        )}
        <div className="ml-auto">
          <SaveButton
            postId={post.id}
            initialSaved={post.saved_by_current_user}
          />
        </div>
      </div>
    </Link>
  )
}
