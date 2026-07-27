import { createClient } from '@/lib/supabase/server'

// Per-channel unread (0036). A channel is unread when its latest post — by someone
// other than the viewer — is newer than the viewer's last_read_at for that channel
// (or they've never opened it). Returns the set of unread community channel ids for
// this teacher. RLS scopes channel_reads to the caller; posts are membership-gated.
export async function getUnreadChannelIds(
  teacherId: string,
): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Community channels for this teacher (weekly channels are excluded from nav).
  const { data: channels } = await supabase
    .from('channels')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('section', 'community')
  const channelIds = (channels ?? []).map((c) => c.id as string)
  if (channelIds.length === 0) return []

  const [{ data: reads }, { data: posts }] = await Promise.all([
    supabase.from('channel_reads').select('channel_id, last_read_at'),
    // Newest first; the latest post per channel is the first one we see per id.
    supabase
      .from('posts')
      .select('channel_id, created_at, author_id')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const lastRead = new Map<string, string>()
  for (const r of (reads ?? []) as {
    channel_id: string
    last_read_at: string
  }[]) {
    lastRead.set(r.channel_id, r.last_read_at)
  }

  const latest = new Map<string, { created_at: string; author_id: string }>()
  for (const p of (posts ?? []) as {
    channel_id: string | null
    created_at: string
    author_id: string
  }[]) {
    if (p.channel_id && !latest.has(p.channel_id)) {
      latest.set(p.channel_id, {
        created_at: p.created_at,
        author_id: p.author_id,
      })
    }
  }

  const unread: string[] = []
  for (const [channelId, post] of latest) {
    if (post.author_id === user.id) continue // your own post isn't "unread"
    const read = lastRead.get(channelId)
    if (!read || post.created_at > read) unread.push(channelId)
  }
  return unread
}
