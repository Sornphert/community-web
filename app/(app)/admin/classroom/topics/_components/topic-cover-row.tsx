'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload as UploadIcon } from 'lucide-react'
import { isAllowedCoverImage } from '@/lib/topic-covers'
import { uploadTopicCover } from '@/lib/topic-cover-upload'
import type { Topic } from '@/lib/types'
import { updateTopicCover } from '../actions'

export function TopicCoverRow({ topic }: { topic: Topic }) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCoverPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (!picked) return

    if (!isAllowedCoverImage(picked)) {
      setError('The cover must be an image file.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      const { url, path } = await uploadTopicCover(picked)
      const result = await updateTopicCover({
        topicId: topic.id,
        coverImageUrl: url,
        coverStoragePath: path,
      })
      if (result.error) {
        throw new Error(result.error)
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to update topic cover:', err)
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
      {topic.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={topic.cover_image_url}
          alt={topic.name}
          className="h-14 w-20 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-muted">
          <span className="px-1 text-center text-[10px] font-medium text-fg-muted">
            No cover
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{topic.name}</p>
        {error && <p className="mt-0.5 text-xs text-danger-text">{error}</p>}
      </div>

      <label
        className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary hover:bg-hover-subtle ${
          isSaving ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        <UploadIcon className="h-4 w-4" />
        {isSaving ? 'Saving…' : topic.cover_image_url ? 'Change cover' : 'Add cover'}
        <input
          type="file"
          accept="image/*"
          onChange={handleCoverPicked}
          disabled={isSaving}
          className="hidden"
        />
      </label>
    </div>
  )
}
