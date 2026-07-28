import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getContentItem, isContentCompleted } from '@/lib/classroom'
import { getTeacherBySlug } from '@/lib/teachers'
import { getPlayerUrl, getThumbnailUrl } from '@/lib/bunny'
import { parseVimeoUrl } from '@/lib/vimeo'
import { PostVideoPlayer } from '../../../community/_components/post-video-player'
import { CompleteToggle } from './_components/complete-toggle'

export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }
  const basePath = `/t/${slug}/classroom`

  const item = await getContentItem(id, teacher.id)

  if (!item) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const initiallyCompleted = await isContentCompleted(user.id, item.id)

  // A video lesson is either a Bunny upload (video_id) or an external URL (Vimeo).
  const isBunny = item.type === 'video' && !!item.video_id
  const parsed =
    item.type === 'video' && !item.video_id
      ? parseVimeoUrl(item.video_url ?? '')
      : null

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={`${basePath}/topic/${item.topic_id}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to topic
      </Link>

      <div className="mt-4">
        {item.type === 'video' ? (
          isBunny ? (
            <PostVideoPlayer
              playerUrl={getPlayerUrl(item.video_id!)}
              posterUrl={item.video_thumbnail_url ?? getThumbnailUrl(item.video_id!)}
              status={item.video_status}
            />
          ) : parsed ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
              <iframe
                src={parsed.embedUrl}
                className="h-full w-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="rounded-lg border border-danger-border bg-danger-subtle p-4">
              <p className="text-sm font-medium text-danger-text">
                Could not load video. Check the URL.
              </p>
              {item.video_url && (
                <a
                  href={item.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block break-all text-sm text-danger-text underline"
                >
                  {item.video_url}
                </a>
              )}
            </div>
          )
        ) : (
          item.thumbnail_url && (
            <div className="mx-auto mb-6 w-full max-w-sm overflow-hidden rounded-lg border border-line shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbnail_url}
                alt={item.title}
                className="block w-full"
              />
            </div>
          )
        )}
      </div>

      <div className="mt-6">
        <h1 className="text-2xl font-semibold text-fg">{item.title}</h1>
        {item.description && (
          <p className="mt-2 whitespace-pre-wrap text-fg-soft">
            {item.description}
          </p>
        )}
      </div>

      {item.type === 'document' && item.document_url && (
        <a
          href={item.document_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-inverse px-4 py-3 text-sm font-medium text-inverse-fg hover:bg-inverse-hover sm:w-auto"
        >
          <ExternalLink className="h-4 w-4" />
          Open Document
        </a>
      )}

      <div className="mt-6">
        <CompleteToggle
          contentItemId={item.id}
          initiallyCompleted={initiallyCompleted}
        />
      </div>
    </div>
  )
}
