'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Marks a channel read on view (0036): upserts channel_reads then refreshes so the
// sidebar/tab unread dot clears. Renders nothing.
export function MarkChannelRead({ channelId }: { channelId: string }) {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return
      supabase
        .from('channel_reads')
        .upsert(
          {
            user_id: user.id,
            channel_id: channelId,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,channel_id' },
        )
        .then(() => {
          if (!cancelled) router.refresh()
        })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  return null
}
