'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCommentLikers, getPostLikers } from '@/lib/posts'
import type { Liker } from '@/lib/types'

type LikeTarget = { targetType: 'post' | 'comment'; targetId: string }

type ActionResult<T> = { data: T } | { error: string }

// Toggle the current user's like on a post or comment. Check-then-act: if the
// like row already exists we delete it (unlike), otherwise we insert it (like).
// The composite PK on post_likes / comment_likes is the real guard against
// double-likes from rapid clicks; this just keeps the intent readable.
export async function toggleLike({
  targetType,
  targetId,
}: LikeTarget): Promise<ActionResult<{ liked: boolean }>> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const table = targetType === 'post' ? 'post_likes' : 'comment_likes'
  const column = targetType === 'post' ? 'post_id' : 'comment_id'

  const { data: existing, error: selectError } = await supabase
    .from(table)
    .select('user_id')
    .eq(column, targetId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (selectError) {
    return { error: selectError.message }
  }

  if (existing) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq(column, targetId)
      .eq('user_id', user.id)

    if (deleteError) {
      return { error: deleteError.message }
    }

    revalidatePath('/community', 'layout')
    return { data: { liked: false } }
  }

  const { error: insertError } = await supabase
    .from(table)
    .insert({ [column]: targetId, user_id: user.id })

  if (insertError) {
    return { error: insertError.message }
  }

  revalidatePath('/community', 'layout')
  return { data: { liked: true } }
}

// Lists the users who liked a post or comment, latest first. Used by the
// likers modal (called from a client component).
export async function getLikers({
  targetType,
  targetId,
}: LikeTarget): Promise<Liker[]> {
  return targetType === 'post'
    ? getPostLikers(targetId)
    : getCommentLikers(targetId)
}
