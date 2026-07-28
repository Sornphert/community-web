'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as tus from 'tus-js-client'
import { AlertCircle, Loader2, RefreshCw, Upload as UploadIcon } from 'lucide-react'
import {
  getLessonVideoUploadCredentials,
  refreshLessonVideoStatus,
} from '../../../actions'

const secondaryBtn =
  'rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted disabled:opacity-50'

// Direct-to-Bunny TUS upload for a video lesson (content_items). Mirrors the
// recordings RecordingUpload — presigned creds from the server action, so the API
// key never reaches the browser. `onUploaded` lets the parent reset/refresh.
export function ContentVideoUpload({
  itemId,
  teacherId,
  title,
  videoStatus,
  videoThumbnailUrl,
  onUploaded,
}: {
  itemId: string
  teacherId: string
  title: string
  videoStatus: string | null
  videoThumbnailUrl: string | null
  onUploaded: () => void
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [replacing, setReplacing] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setUploading(true)
    setProgress(0)

    const result = await getLessonVideoUploadCredentials(teacherId, itemId)
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
      metadata: { filetype: file.type, title },
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
    const result = await refreshLessonVideoStatus(teacherId, itemId)
    setRefreshing(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  if (uploading) {
    return (
      <div className="rounded-md border border-line bg-canvas p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-fg-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
          Uploading… {progress}%
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-strong">
          <div
            className="h-full rounded-full bg-inverse transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    )
  }

  if (videoStatus === 'processing') {
    return (
      <div className="rounded-md border border-line bg-canvas p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-fg-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
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
        {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
      </div>
    )
  }

  if (videoStatus === 'ready' && !replacing) {
    return (
      <div className="rounded-md border border-line bg-canvas p-3">
        {videoThumbnailUrl && (
          <div className="mb-2 aspect-video w-full overflow-hidden rounded bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={videoThumbnailUrl}
              alt={title}
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

  return (
    <div className="rounded-md border border-line bg-canvas p-3">
      {videoStatus === 'failed' && (
        <p className="mb-2 flex items-center gap-1.5 text-sm text-danger-text">
          <AlertCircle className="h-4 w-4" />
          The previous upload failed. Try again.
        </p>
      )}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 py-4 text-sm font-medium text-fg-secondary hover:bg-hover-subtle">
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
      {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
