'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRelativeTime } from '@/lib/format'
import type { Channel } from '@/lib/types'
import type { UnassignedPost } from '@/lib/posts'
import { assignPostChannel } from '../actions'

export function MigrateList({
  posts,
  channels,
}: {
  posts: UnassignedPost[]
  channels: Channel[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <MigrateRow key={post.id} post={post} channels={channels} />
      ))}
    </div>
  )
}

function MigrateRow({
  post,
  channels,
}: {
  post: UnassignedPost
  channels: Channel[]
}) {
  const router = useRouter()
  const [channelId, setChannelId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!channelId) {
      setError('Pick a channel first.')
      return
    }
    setIsSaving(true)
    setError(null)

    const result = await assignPostChannel({ postId: post.id, channelId })

    if (result.error) {
      setError(result.error)
      setIsSaving(false)
      return
    }

    // The row drops out of the list once the server component re-renders.
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <span className="font-medium text-fg-secondary">
          {post.author?.display_name ?? 'Unknown'}
        </span>
        <span>{formatRelativeTime(post.created_at)}</span>
      </div>

      {post.title && (
        <h2 className="mt-2 font-semibold text-fg">{post.title}</h2>
      )}
      {post.body && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-fg-soft">
          {post.body}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          disabled={isSaving}
          className="rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="">Select channel…</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !channelId}
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        {error && <span className="text-sm text-danger-text">{error}</span>}
      </div>
    </div>
  )
}
