'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, SmilePlus, ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/app/_components/toast'
import { convertToJpg } from '@/lib/image'
import { formatRelativeTime } from '@/lib/format'
import { ImageLightbox } from '@/app/(app)/_components/image-lightbox'
import type { DmMessage } from '@/lib/dm'
import type { ReactionSummary } from '@/lib/types'

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥']

// Apply a +1/-1 delta for one emoji to a message's reaction summary. `mine` updates the
// viewer's own flag (for local toggles); remote events pass mine=false.
function applyDelta(
  reactions: ReactionSummary[],
  emoji: string,
  delta: number,
  mine: boolean,
): ReactionSummary[] {
  const existing = reactions.find((r) => r.emoji === emoji)
  const others = reactions.filter((r) => r.emoji !== emoji)
  const count = (existing?.count ?? 0) + delta
  if (count <= 0) return others
  return [
    ...others,
    {
      emoji,
      count,
      reacted_by_current_user: mine
        ? delta > 0
        : (existing?.reacted_by_current_user ?? false),
    },
  ]
}

// The message thread: a scrolling transcript + a composer, with per-message emoji
// reactions and a live "typing…" indicator. Marks the thread read on mount.
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
  const { showToast } = useToast()
  const [messages, setMessages] = useState<DmMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  const [image, setImage] = useState<{ file: File; preview: string } | null>(
    null,
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [otherTyping, setOtherTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>['channel']
  > | null>(null)
  const lastTypingSentRef = useRef(0)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function patchReactions(
    messageId: string,
    fn: (r: ReactionSummary[]) => ReactionSummary[],
  ) {
    setMessages((cur) =>
      cur.map((m) =>
        m.id === messageId ? { ...m, reactions: fn(m.reactions) } : m,
      ),
    )
  }

  // Mark read once on open, then refresh so the sidebar badge recomputes.
  useEffect(() => {
    const supabase = createClient()
    supabase.rpc('mark_dm_read', { p_thread: threadId }).then(() => {
      router.refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // Realtime: new messages + reaction changes for this thread. My own writes are already
  // applied optimistically (deduped by id / ignored when user_id === me).
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
          const raw = payload.new as Omit<DmMessage, 'reactions'>
          const m: DmMessage = { ...raw, reactions: [] }
          setMessages((cur) =>
            cur.some((x) => x.id === m.id) ? cur : [...cur, m],
          )
          if (m.sender_id !== meId) {
            void supabase.rpc('mark_dm_read', { p_thread: threadId })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_message_reactions' },
        (payload) => {
          const r = payload.new as {
            message_id: string
            user_id: string
            emoji: string
          }
          if (r.user_id === meId) return // my own — already optimistic
          patchReactions(r.message_id, (rs) =>
            applyDelta(rs, r.emoji, 1, false),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'dm_message_reactions' },
        (payload) => {
          const r = payload.old as {
            message_id: string
            user_id: string
            emoji: string
          }
          if (r.user_id === meId) return
          patchReactions(r.message_id, (rs) =>
            applyDelta(rs, r.emoji, -1, false),
          )
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // Typing indicator over a lightweight broadcast channel (no DB writes).
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`dm-typing-${threadId}`, {
      config: { broadcast: { self: false } },
    })
    channel
      .on('broadcast', { event: 'typing' }, (msg) => {
        if ((msg.payload as { userId: string }).userId === meId) return
        setOtherTyping(true)
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000)
      })
      .subscribe()
    typingChannelRef.current = channel
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      void supabase.removeChannel(channel)
      typingChannelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, otherTyping])

  function broadcastTyping() {
    const now = Date.now()
    if (now - lastTypingSentRef.current < 1500) return // throttle
    lastTypingSentRef.current = now
    void typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: meId },
    })
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPickerFor(null)
    const msg = messages.find((m) => m.id === messageId)
    const wasReacted =
      msg?.reactions.find((r) => r.emoji === emoji)?.reacted_by_current_user ??
      false
    // Optimistic.
    patchReactions(messageId, (rs) =>
      applyDelta(rs, emoji, wasReacted ? -1 : 1, true),
    )
    const supabase = createClient()
    try {
      if (wasReacted) {
        const { error: e } = await supabase
          .from('dm_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', meId)
          .eq('emoji', emoji)
        if (e) throw e
      } else {
        const { error: e } = await supabase
          .from('dm_message_reactions')
          .insert({ message_id: messageId, user_id: meId, emoji })
        if (e && e.code !== '23505') throw e
      }
    } catch {
      // Revert.
      patchReactions(messageId, (rs) =>
        applyDelta(rs, emoji, wasReacted ? 1 : -1, true),
      )
      showToast('Could not update reaction.', 'error')
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if ((!text && !image) || sending) return
    setSending(true)
    setError(null)
    try {
      const supabase = createClient()

      // Upload the image first (public dm-images bucket, own-folder path) so the
      // message row carries its public URL.
      let imageUrl: string | null = null
      let imagePath: string | null = null
      if (image) {
        const blob = await convertToJpg(image.file)
        const path = `${meId}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('dm-images')
          .upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        imageUrl = supabase.storage.from('dm-images').getPublicUrl(path).data
          .publicUrl
        imagePath = path
      }

      const { data, error: sendError } = await supabase.rpc('send_dm', {
        p_thread: threadId,
        p_body: text,
        p_image_url: imageUrl,
        p_image_path: imagePath,
      })
      if (sendError) throw sendError
      const raw = (Array.isArray(data) ? data[0] : data) as Omit<
        DmMessage,
        'reactions'
      >
      setMessages((cur) => [...cur, { ...raw, reactions: [] }])
      setBody('')
      if (image) URL.revokeObjectURL(image.preview)
      setImage(null)
    } catch {
      setError('Could not send. Please try again.')
      showToast('Could not send message', 'error')
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
                className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`flex items-center gap-1 ${mine ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'bg-inverse text-inverse-fg'
                        : 'bg-surface text-fg border border-line'
                    }`}
                  >
                    {m.image_url && (
                      <ImageLightbox
                        src={m.image_url}
                        className="mb-1 max-h-64 rounded-lg"
                      />
                    )}
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    )}
                    <p
                      className={`mt-1 text-[10px] ${
                        mine ? 'text-inverse-fg/70' : 'text-fg-muted'
                      }`}
                    >
                      {formatRelativeTime(m.created_at)}
                    </p>
                  </div>
                  {/* React affordance (appears on hover) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setPickerFor((cur) => (cur === m.id ? null : m.id))
                      }
                      aria-label="React"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted opacity-0 transition-opacity hover:bg-muted hover:text-fg group-hover:opacity-100"
                    >
                      <SmilePlus className="h-4 w-4" />
                    </button>
                    {pickerFor === m.id && (
                      <div
                        className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-full border border-line bg-surface px-2 py-1 shadow-md ${
                          mine ? 'right-0' : 'left-0'
                        }`}
                      >
                        {EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction(m.id, emoji)}
                            className="rounded-full p-1 text-base transition-transform hover:scale-125"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reaction chips */}
                {m.reactions.length > 0 && (
                  <div
                    className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => toggleReaction(m.id, r.emoji)}
                        aria-pressed={r.reacted_by_current_user}
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
                          r.reacted_by_current_user
                            ? 'border-inverse bg-muted text-fg'
                            : 'border-line text-fg-secondary hover:bg-muted'
                        }`}
                      >
                        <span>{r.emoji}</span>
                        {r.count}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
        {otherTyping && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-fg-muted">
              typing…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-canvas py-3"
      >
        {image && (
          <div className="relative h-20 w-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.preview}
              alt=""
              className="h-20 w-20 rounded-md object-cover"
            />
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(image.preview)
                setImage(null)
              }}
              aria-label="Remove image"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-inverse text-inverse-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <label
            className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg ${
              image ? 'pointer-events-none opacity-40' : ''
            }`}
            aria-label="Attach image"
          >
            <ImagePlus className="h-5 w-5" />
            <input
              type="file"
              accept="image/*"
              disabled={!!image}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file)
                  setImage({ file, preview: URL.createObjectURL(file) })
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              broadcastTyping()
            }}
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
            disabled={sending || (!body.trim() && !image)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inverse text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
      {error && <p className="pb-2 text-sm text-danger-text">{error}</p>}
    </div>
  )
}
