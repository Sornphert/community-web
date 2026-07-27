'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/app/_components/toast'
import type { PollOption, PollSummary } from '@/lib/types'

// A poll on a post (0033). Renders each option as a clickable bar showing the live
// tally + percentage; the viewer's picks are highlighted. Single-choice polls switch
// the vote on click; multi-choice toggle each option. Voting is optimistic and
// own-only via RLS. Sits inside the feed card's <Link>, so every handler stops
// propagation. Closed polls (past closes_at) render read-only results.
export function PollView({ poll }: { poll: PollSummary }) {
  const { showToast } = useToast()
  const [options, setOptions] = useState<PollOption[]>(poll.options)
  const [total, setTotal] = useState(poll.total_votes)
  const [pending, setPending] = useState(false)

  const closed = poll.closes_at !== null && new Date(poll.closes_at) <= new Date()

  async function vote(optionId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending || closed) return

    const target = options.find((o) => o.id === optionId)
    if (!target) return
    const wasVoted = target.voted_by_current_user
    const prevOptions = options
    const prevTotal = total

    // Optimistic update.
    setOptions((cur) =>
      cur.map((o) => {
        if (poll.allow_multiple) {
          if (o.id !== optionId) return o
          return wasVoted
            ? { ...o, votes: o.votes - 1, voted_by_current_user: false }
            : { ...o, votes: o.votes + 1, voted_by_current_user: true }
        }
        // Single-choice: clicking the current pick removes it; otherwise this
        // becomes the only pick.
        if (wasVoted) {
          return o.id === optionId
            ? { ...o, votes: o.votes - 1, voted_by_current_user: false }
            : o
        }
        if (o.id === optionId)
          return { ...o, votes: o.votes + 1, voted_by_current_user: true }
        if (o.voted_by_current_user)
          return { ...o, votes: o.votes - 1, voted_by_current_user: false }
        return o
      }),
    )
    setTotal((t) => {
      if (poll.allow_multiple) return wasVoted ? t - 1 : t + 1
      // Single-choice: switching keeps the total; adding/removing shifts by one.
      if (wasVoted) return t - 1
      const hadAny = prevOptions.some((o) => o.voted_by_current_user)
      return hadAny ? t : t + 1
    })
    setPending(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      if (wasVoted) {
        const { error } = await supabase
          .from('poll_votes')
          .delete()
          .eq('option_id', optionId)
          .eq('user_id', user.id)
        if (error) throw error
      } else {
        if (!poll.allow_multiple) {
          // Clear any prior pick for this poll before inserting the new one.
          const { error: delError } = await supabase
            .from('poll_votes')
            .delete()
            .eq('poll_id', poll.id)
            .eq('user_id', user.id)
          if (delError) throw delError
        }
        const { error } = await supabase.from('poll_votes').insert({
          poll_id: poll.id,
          option_id: optionId,
          user_id: user.id,
        })
        if (error && error.code !== '23505') throw error
      }
    } catch {
      setOptions(prevOptions) // revert on failure
      setTotal(prevTotal)
      showToast('Could not record your vote.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line p-3">
      {options.map((o) => {
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0
        return (
          <button
            key={o.id}
            type="button"
            onClick={(e) => vote(o.id, e)}
            disabled={pending || closed}
            aria-pressed={o.voted_by_current_user}
            className={`relative overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${
              o.voted_by_current_user
                ? 'border-inverse'
                : 'border-line hover:bg-muted'
            } ${closed ? 'cursor-default' : ''}`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-muted"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-fg">
                {o.voted_by_current_user && (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                )}
                {o.text}
              </span>
              <span className="shrink-0 text-xs text-fg-muted">
                {pct}% · {o.votes}
              </span>
            </div>
          </button>
        )
      })}
      <p className="text-xs text-fg-muted">
        {total} {total === 1 ? 'vote' : 'votes'}
        {poll.allow_multiple && ' · pick multiple'}
        {closed && ' · closed'}
      </p>
    </div>
  )
}
