import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

// Direct messages (0034). Threads are 1:1 and teacher-scoped; RLS already limits
// every query below to threads the caller participates in, so these fetchers add
// only the tenant filter + the "who is the other person / am I caught up" shaping.

export type DmThreadListItem = {
  id: string
  other: Profile
  lastMessage: string | null
  lastMessageAt: string | null
  unread: boolean
}

export type DmMessage = {
  id: string
  sender_id: string
  body: string
  created_at: string
}

export type DmThreadDetail = {
  id: string
  other: Profile
  messages: DmMessage[]
}

type ThreadRow = {
  id: string
  user_a: string
  user_b: string
  last_message_at: string | null
  user_a_last_read_at: string | null
  user_b_last_read_at: string | null
  a: Profile | null
  b: Profile | null
}

// Every thread the caller has in this teacher, newest activity first, each with the
// other participant, a last-message preview, and an unread flag.
export async function getDmThreads(
  teacherId: string,
): Promise<DmThreadListItem[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('dm_threads')
    .select(
      'id, user_a, user_b, last_message_at, user_a_last_read_at, user_b_last_read_at, a:profiles!user_a(*), b:profiles!user_b(*)',
    )
    .eq('teacher_id', teacherId)
    .order('last_message_at', { ascending: false })

  if (error) throw new Error(`Failed to load messages: ${error.message}`)

  const threads = (data ?? []) as unknown as ThreadRow[]
  if (threads.length === 0) return []

  // One query for the latest message of each thread, reduced client-side.
  const ids = threads.map((t) => t.id)
  const { data: msgData, error: msgError } = await supabase
    .from('dm_messages')
    .select('thread_id, body, created_at, sender_id')
    .in('thread_id', ids)
    .order('created_at', { ascending: false })

  if (msgError) throw new Error(`Failed to load messages: ${msgError.message}`)

  const latest = new Map<
    string,
    { body: string; created_at: string; sender_id: string }
  >()
  for (const m of (msgData ?? []) as {
    thread_id: string
    body: string
    created_at: string
    sender_id: string
  }[]) {
    if (!latest.has(m.thread_id)) latest.set(m.thread_id, m)
  }

  return threads
    .map((t) => {
      const iAmA = t.user_a === user.id
      const other = iAmA ? t.b : t.a
      if (!other) return null
      const myLastRead = iAmA ? t.user_a_last_read_at : t.user_b_last_read_at
      const last = latest.get(t.id) ?? null
      const unread =
        !!last &&
        last.sender_id !== user.id &&
        (!myLastRead || last.created_at > myLastRead)
      return {
        id: t.id,
        other,
        lastMessage: last?.body ?? null,
        lastMessageAt: last?.created_at ?? t.last_message_at,
        unread,
      }
    })
    .filter((t): t is DmThreadListItem => t !== null)
}

// One thread + its messages (oldest first). Returns null if the caller can't see it
// (RLS drops it) or it doesn't exist.
export async function getDmThread(
  threadId: string,
): Promise<DmThreadDetail | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('dm_threads')
    .select('id, user_a, user_b, a:profiles!user_a(*), b:profiles!user_b(*)')
    .eq('id', threadId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load conversation: ${error.message}`)
  if (!data) return null

  const row = data as unknown as Pick<
    ThreadRow,
    'id' | 'user_a' | 'user_b' | 'a' | 'b'
  >
  const other = row.user_a === user.id ? row.b : row.a
  if (!other) return null

  const { data: msgData, error: msgError } = await supabase
    .from('dm_messages')
    .select('id, sender_id, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (msgError)
    throw new Error(`Failed to load conversation: ${msgError.message}`)

  return {
    id: row.id,
    other,
    messages: (msgData ?? []) as DmMessage[],
  }
}

// Total unread DM messages for the caller within this teacher (nav badge).
export async function getDmUnreadCount(teacherId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dm_unread_count', {
    p_teacher: teacherId,
  })
  if (error) return 0
  return (data as number) ?? 0
}
