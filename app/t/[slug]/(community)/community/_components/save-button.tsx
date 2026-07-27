'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Bookmark toggle for a post. Optimistic; own-only via RLS. Lives inside the feed
// card's <Link>, so it stops event propagation to avoid triggering navigation.
// `refreshOnChange` is used on the Saved page so an unsave removes the card.
export function SaveButton({
  postId,
  initialSaved,
  refreshOnChange = false,
}: {
  postId: string
  initialSaved: boolean
  refreshOnChange?: boolean
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return
    const next = !saved
    setSaved(next)
    setPending(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      if (next) {
        const { error } = await supabase
          .from('saved_posts')
          .insert({ user_id: user.id, post_id: postId })
        if (error && error.code !== '23505') throw error
      } else {
        const { error } = await supabase
          .from('saved_posts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
        if (error) throw error
      }
      if (refreshOnChange) router.refresh()
    } catch {
      setSaved(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? 'Remove bookmark' : 'Save post'}
      className={`inline-flex items-center gap-1 rounded-md p-1 text-sm transition-colors hover:text-fg disabled:opacity-50 ${
        saved ? 'text-fg' : 'text-fg-muted'
      }`}
    >
      <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
    </button>
  )
}
