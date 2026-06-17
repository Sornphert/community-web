'use client'

import { useRef, useState } from 'react'
import * as tus from 'tus-js-client'
import { AlertCircle, CheckCircle2, Loader2, Upload as UploadIcon, X } from 'lucide-react'
import { createPostVideoUploadCredentials } from './post-video-actions'

// Admin-only video picker for the post composer. Drives a direct-to-Bunny TUS
// upload using presigned credentials minted by the server action — the API key
// never reaches the browser. Mirrors the classroom RecordingUpload, but there is
// no recording row yet: the parent composer inserts the post_videos row (with the
// returned videoId) after the post itself is created.
//
// Callbacks:
//   onUploadingChange — toggles while the byte upload is in flight, so the parent
//                       can disable submit until the video has finished uploading.
//   onUploaded        — fires once with the Bunny videoId after a successful upload.
//   onCleared         — fires when the admin removes the selected video.
export function PostVideoUpload({
  title,
  onUploadingChange,
  onUploaded,
  onCleared,
}: {
  title: string
  onUploadingChange: (uploading: boolean) => void
  onUploaded: (videoId: string) => void
  onCleared: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file after an error
    if (!file) return

    setError(null)
    setFileName(file.name)
    setDone(false)
    setUploading(true)
    setProgress(0)
    onUploadingChange(true)

    const result = await createPostVideoUploadCredentials(title)
    if (result.error || !result.credentials || !result.videoId) {
      setError(result.error ?? 'Could not start the upload.')
      setUploading(false)
      onUploadingChange(false)
      return
    }

    const { videoId } = result
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
        title: title.trim() || 'Post video',
      },
      onError(err) {
        setError(err instanceof Error ? err.message : 'Upload failed.')
        setUploading(false)
        onUploadingChange(false)
      },
      onProgress(bytesUploaded, bytesTotal) {
        setProgress(Math.round((bytesUploaded / bytesTotal) * 100))
      },
      onSuccess() {
        setUploading(false)
        setDone(true)
        onUploadingChange(false)
        onUploaded(videoId)
      },
    })

    upload.start()
  }

  function handleRemove() {
    setUploading(false)
    setProgress(0)
    setError(null)
    setFileName(null)
    setDone(false)
    onUploadingChange(false)
    onCleared()
  }

  if (uploading) {
    return (
      <div className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Video
        <div className="rounded-md border border-line bg-canvas p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-normal text-fg-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
            Uploading {fileName ? `“${fileName}”` : 'video'}… {progress}%
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-strong">
            <div
              className="h-full rounded-full bg-inverse transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Video
        <div className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate text-sm font-normal text-fg">
            {fileName ?? 'Video'} uploaded — it will process after you post.
          </span>
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
            aria-label="Remove video"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
      Video (optional)
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 py-4 text-sm font-normal text-fg-secondary hover:bg-hover-subtle">
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
      {error && (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-normal text-danger-text">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
