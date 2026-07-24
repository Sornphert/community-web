'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionResult = { data: true } | { error: string }

// Author-OR-admin gate for a comment, enforced server-side (the comments RLS from
// 0018 is the second layer). `ownerOnly` restricts to the author (edit case) —
// editing another person's words is never allowed, even for admins.
async function requireCommentAccess(
  commentId: string,
  ownerOnly: boolean,
): Promise<{ userId: string; authorId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: comment } = await supabase
    .from('comments')
    .select('author_id')
    .eq('id', commentId)
    .maybeSingle()
  if (!comment) {
    return { error: 'Comment not found.' }
  }

  const isOwner = user.id === comment.author_id
  let isAdmin = false
  if (!ownerOnly && !isOwner) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
    isAdmin = profile?.is_admin === true
  }

  if (!isOwner && (ownerOnly || !isAdmin)) {
    return {
      error: ownerOnly
        ? 'You can only edit your own comments.'
        : 'You can only delete your own comments.',
    }
  }

  return { userId: user.id, authorId: comment.author_id }
}

// Edit a comment's text (AUTHOR ONLY). Stamps edited_at. Empty body is rejected.
export async function updateComment({
  commentId,
  body,
}: {
  commentId: string
  body: string
}): Promise<ActionResult> {
  const trimmed = body.trim()
  if (!trimmed) {
    return { error: 'Comment cannot be empty.' }
  }

  const auth = await requireCommentAccess(commentId, true)
  if ('error' in auth) return auth

  // service-role write keeps a single server-side gate (consistent with posts).
  const admin = createAdminClient()
  const { error } = await admin
    .from('comments')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', commentId)
  if (error) {
    return { error: error.message }
  }

  revalidatePath('/community', 'layout')
  return { data: true }
}

// Delete a comment (AUTHOR OR ADMIN). comment_likes cascade via FK.
export async function deleteComment({
  commentId,
}: {
  commentId: string
}): Promise<ActionResult> {
  const auth = await requireCommentAccess(commentId, false)
  if ('error' in auth) return auth

  const admin = createAdminClient()

  // Gather image bytes before the rows cascade away (storage doesn't cascade).
  const { data: imgs } = await admin
    .from('comment_images')
    .select('storage_path')
    .eq('comment_id', commentId)

  const { error } = await admin.from('comments').delete().eq('id', commentId)
  if (error) {
    return { error: error.message }
  }

  const paths = (imgs ?? []).map((r) => r.storage_path)
  if (paths.length > 0) {
    const { error: rmError } = await admin.storage
      .from('comment-images')
      .remove(paths)
    if (rmError) console.error('Failed to remove comment-images objects:', rmError)
  }

  revalidatePath('/community', 'layout')
  return { data: true }
}
