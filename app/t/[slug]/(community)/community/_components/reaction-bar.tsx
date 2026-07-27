'use client'

import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ReactionSummary } from '@/lib/types'

// The emoji palette members can react with.
const EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥']

// Emoji reactions on a post (0032). Shows a chip per emoji with a count (highlighted
// if you reacted); the "+" opens a small palette. Optimistic; own-only via RLS. Sits
// inside the feed card's <Link>, so every handler stops propagation.
export function ReactionBar({
  postId,
  initial,
}: {
  postId: string
  initial: ReactionSummary[]
}) {
  const [reactions, setReactions] = useState<ReactionSummary[]>(initial)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const sorted = [...reactions].sort((a, b) => {
    const ai = EMOJIS.indexOf(a.emoji)
    const bi = EMOJIS.indexOf(b.emoji)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })

  async function toggle(emoji: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    const existing = reactions.find((r) => r.emoji === emoji)
    const wasReacted = existing?.reacted_by_current_user ?? false
    const prev = reactions

    setReactions((cur) => {
      const others = cur.filter((r) => r.emoji !== emoji)
      if (wasReacted) {
        const count = (existing?.count ?? 1) - 1
        return count > 0
          ? [...others, { emoji, count, reacted_by_current_user: false }]
          : others
      }
      return [
        ...others,
        { emoji, count: (existing?.count ?? 0) + 1, reacted_by_current_user: true },
      ]
    })
    setPickerOpen(false)
    setPending(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      if (wasReacted) {
        const { error } = await supabase
          .from('post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .eq('emoji', emoji)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('post_reactions')
          .insert({ post_id: postId, user_id: user.id, emoji })
        if (error && error.code !== '23505') throw error
      }
    } catch {
      setReactions(prev) // revert on failure
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex items-center gap-1.5">
      {sorted.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => toggle(r.emoji, e)}
          disabled={pending}
          aria-pressed={r.reacted_by_current_user}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-50 ${
            r.reacted_by_current_user
              ? 'border-inverse bg-muted text-fg'
              : 'border-line text-fg-secondary hover:bg-muted'
          }`}
        >
          <span>{r.emoji}</span>
          {r.count}
        </button>
      ))}

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setPickerOpen((o) => !o)
        }}
        aria-label="Add reaction"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
      >
        <SmilePlus className="h-4 w-4" />
      </button>

      {pickerOpen && (
        <div className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 rounded-full border border-line bg-surface px-2 py-1 shadow-md">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={(e) => toggle(emoji, e)}
              className="rounded-full p-1 text-base transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
