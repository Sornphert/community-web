'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/app/_components/toast'
import type { ContentItem } from '@/lib/types'
import { createVideoLesson } from '../../../actions'
import { ContentVideoUpload } from './content-video-upload'

const inputClass =
  'rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring'

// Add a video lesson: enter title/description, create the row (provisions the Bunny
// video), then upload the file into the revealed upload area. Mirrors the recordings
// create → upload flow.
export function VideoLessonForm({
  teacherId,
  topicId,
}: {
  teacherId: string
  topicId: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<ContentItem | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating || !title.trim()) return
    setCreating(true)
    const result = await createVideoLesson({
      teacherId,
      topicId,
      title,
      description,
    })
    setCreating(false)
    if (result.error || !result.item) {
      showToast(result.error ?? 'Could not create video lesson.', 'error')
      return
    }
    setCreated(result.item)
  }

  function reset() {
    setCreated(null)
    setTitle('')
    setDescription('')
    router.refresh()
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-medium text-fg">{created.title}</p>
        <ContentVideoUpload
          itemId={created.id}
          teacherId={teacherId}
          title={created.title}
          videoStatus={created.video_status}
          videoThumbnailUrl={created.video_thumbnail_url}
          onUploaded={() => {
            showToast('Video uploaded — processing', 'success')
            reset()
          }}
        />
        <button
          type="button"
          onClick={reset}
          className="self-start text-sm font-medium text-fg-secondary hover:text-fg"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleCreate}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </label>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Add video'}
        </button>
      </div>
    </form>
  )
}
