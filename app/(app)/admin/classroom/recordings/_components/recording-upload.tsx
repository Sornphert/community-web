'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as tus from 'tus-js-client'
import { AlertCircle, Loader2, RefreshCw, Upload as UploadIcon } from 'lucide-react'
import type { ClassroomRecording } from '@/lib/types'
import { getRecordingUploadCredentials, refreshRecordingStatus } from '../actions'

const secondaryBtn =
  'rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50'

// Upload area shown inside the recording modal. Drives a direct-to-Bunny TUS
// upload using presigned credentials minted by the server action — the API key
// never reaches the browser. `onUploaded` lets the parent close + refresh.
export function RecordingUpload({
  recording,
  onUploaded,
}: {
  recording: ClassroomRecording
  onUploaded: () => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // When 'ready', the admin must opt into replacing before the picker shows.
  const [replacing, setReplacing] = useState(false)

  const status = recording.video_status

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file after an error
    if (!file) return

    setError(null)
    setUploading(true)
    setProgress(0)

    const result = await getRecordingUploadCredentials(recording.id)
    if (result.error || !result.credentials) {
      setError(result.error ?? 'Could not start the upload.')
      setUploading(false)
      return
    }

    const creds = result.credentials
    const upload = new tus.Upload(file, {
      endpoint: creds.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: creds.authorizationSignature,
        AuthorizationExpire: String(creds.authorizationExpire),
        VideoId: creds.videoId,
        LibraryId: creds.libraryId,
      },
      metadata: {
        filetype: file.type,
        title: recording.title,
      },
      onError(err) {
        setError(err instanceof Error ? err.message : 'Upload failed.')
        setUploading(false)
      },
      onProgress(bytesUploaded, bytesTotal) {
        setProgress(Math.round((bytesUploaded / bytesTotal) * 100))
      },
      onSuccess() {
        setUploading(false)
        onUploaded()
      },
    })

    upload.start()
  }

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    const result = await refreshRecordingStatus(recording.id)
    setRefreshing(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  if (uploading) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-zinc-700">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          Uploading… {progress}%
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  // Live status (the parent re-renders after router.refresh()).
  if (status === 'processing') {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-zinc-700">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            Video processing…
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={secondaryBtn}
          >
            <RefreshCw
              className={`mr-1 inline h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    )
  }

  if (status === 'ready' && !replacing) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
        {recording.video_thumbnail_url && (
          <div className="mb-2 aspect-video w-full overflow-hidden rounded bg-zinc-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recording.video_thumbnail_url}
              alt={recording.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setReplacing(true)}
          className={secondaryBtn}
        >
          <UploadIcon className="mr-1 inline h-3.5 w-3.5" />
          Replace video
        </button>
      </div>
    )
  }

  // 'pending' | 'failed' | null, or replacing an existing video.
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      {status === 'failed' && (
        <p className="mb-2 flex items-center gap-1.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          The previous upload failed. Try again.
        </p>
      )}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 bg-white px-3 py-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
        <UploadIcon className="h-4 w-4" />
        Choose a video file
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFile}
          className="hidden"
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
