'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/format'
import type { DmMessage } from '@/lib/dm'

// The message thread: a scrolling transcript + a composer. Marks the thread read on
// mount (clears the nav badge on next refresh). Sending goes through send_dm and
// appends the returned row optimistically.
export function ThreadView({
  threadId,
  meId,
  initialMessages,
}: {
  threadId: string
  meId: string
  initialMessages: DmMessage[]
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<DmMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Mark read once on open, then refresh so the sidebar badge recomputes.
  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('mark_dm_read', { p_thread: threadId }).then(() => {
      router.refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // Realtime: append messages inserted into this thread by the other person (my own
  // sends are already appended optimistically; the id check dedupes). Inbound
  // messages are marked read immediately since the thread is open.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dm-thread-${threadId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const m = payload.new as DmMessage
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]))
          if (m.sender_id !== meId) {
            void supabase.rpc('mark_dm_read', { p_thread: threadId })
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: sendError } = await supabase.rpc('send_dm', {
        p_thread: threadId,
        p_body: text,
      })
      if (sendError) throw sendError
      const msg = (Array.isArray(data) ? data[0] : data) as DmMessage
      setMessages((cur) => [...cur, msg])
      setBody('')
    } catch {
      setError('Could not send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-2 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-muted">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === meId
            return (
              <div
                key={m.id}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? 'bg-inverse text-inverse-fg'
                      : 'bg-surface text-fg border border-line'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      mine ? 'text-inverse-fg/70' : 'text-fg-muted'
                    }`}
                  >
                    {formatRelativeTime(m.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-canvas py-3"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Write a message…"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inverse text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {error && <p className="pb-2 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
