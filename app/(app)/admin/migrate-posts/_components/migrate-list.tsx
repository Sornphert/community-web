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
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <span className="font-medium text-zinc-700">
          {post.author?.display_name ?? 'Unknown'}
        </span>
        <span>{formatRelativeTime(post.created_at)}</span>
      </div>

      {post.title && (
        <h2 className="mt-2 font-semibold text-zinc-900">{post.title}</h2>
      )}
      {post.body && (
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-zinc-600">
          {post.body}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          disabled={isSaving}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
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
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </div>
  )
}
