import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertCircle, ChevronRight, Loader2 } from 'lucide-react'
import {
  getFolderAncestors,
  getFolders,
  getRecording,
  isRecordingCompleted,
} from '@/lib/recordings'
import { getPlayerUrl } from '@/lib/bunny'
import { CompleteToggle } from './_components/complete-toggle'

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const recording = await getRecording(id)
  if (!recording) {
    notFound()
  }

  const folders = await getFolders()
  const ancestors = getFolderAncestors(folders, recording.folder_id)

  const initiallyCompleted = await isRecordingCompleted(id)

  const createdDate = recording.created_at
    ? new Date(recording.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <div className="mx-auto w-full max-w-3xl">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
        <Link href="/classroom" className="hover:text-zinc-900">
          Classroom
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
        <Link href="/classroom/recordings" className="hover:text-zinc-900">
          Recordings
        </Link>
        {ancestors.map((folder) => (
          <Fragment key={folder.id}>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
            <Link
              href={`/classroom/recordings#folder-${folder.id}`}
              className="hover:text-zinc-900"
            >
              {folder.name}
            </Link>
          </Fragment>
        ))}
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
        <span className="font-medium text-zinc-900">{recording.title}</span>
      </nav>

      <div className="mt-4">
        {recording.video_status === 'ready' && recording.video_id ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-zinc-200 bg-black">
            <iframe
              src={getPlayerUrl(recording.video_id)}
              loading="lazy"
              style={{ border: 'none', width: '100%', height: '100%' }}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
            {recording.video_status === 'processing' ? (
              <p className="flex items-center gap-2 px-4 text-center text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Video is processing. Check back in a few minutes.
              </p>
            ) : recording.video_status === 'failed' ? (
              <p className="flex items-center gap-2 px-4 text-center text-sm text-zinc-500">
                <AlertCircle className="h-4 w-4" />
                Video unavailable. Please contact admin.
              </p>
            ) : (
              <p className="px-4 text-center text-sm text-zinc-500">
                No video for this recording yet.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {recording.title}
        </h1>
        {createdDate && (
          <p className="mt-1 text-sm text-zinc-500">Created {createdDate}</p>
        )}
        {recording.description && (
          <p className="mt-4 whitespace-pre-wrap text-zinc-600">
            {recording.description}
          </p>
        )}
      </div>

      {recording.video_status === 'ready' && (
        <div className="mt-6">
          <CompleteToggle
            recordingId={recording.id}
            initiallyCompleted={initiallyCompleted}
          />
        </div>
      )}
    </div>
  )
}
