import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getContentItem, isContentCompleted } from '@/lib/classroom'
import { parseVimeoUrl } from '@/lib/vimeo'
import { CompleteToggle } from './_components/complete-toggle'

export default async function ContentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const item = await getContentItem(id)

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

  const parsed = item.type === 'video' ? parseVimeoUrl(item.video_url ?? '') : null

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={`/classroom/topic/${item.topic_id}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to topic
      </Link>

      <div className="mt-4">
        {item.type === 'video' ? (
          parsed ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-zinc-200 bg-black">
              <iframe
                src={parsed.embedUrl}
                className="h-full w-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                Could not load video. Check the URL.
              </p>
              {item.video_url && (
                <a
                  href={item.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block break-all text-sm text-red-700 underline"
                >
                  {item.video_url}
                </a>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center rounded-lg border border-zinc-200 bg-white p-6 text-center">
            <FileText className="h-12 w-12 text-zinc-400" />
            <h2 className="mt-4 text-lg font-medium text-zinc-900">
              {item.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Click below to view the document.
            </p>
            {item.document_url && (
              <a
                href={item.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-800"
              >
                <ExternalLink className="h-4 w-4" />
                Open Document
              </a>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h1 className="text-2xl font-semibold text-zinc-900">{item.title}</h1>
        {item.description && (
          <p className="mt-2 whitespace-pre-wrap text-zinc-600">
            {item.description}
          </p>
        )}
      </div>

      <div className="mt-6">
        <CompleteToggle
          contentItemId={item.id}
          initiallyCompleted={initiallyCompleted}
        />
      </div>
    </div>
  )
}
