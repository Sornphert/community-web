'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteVideo } from '@/lib/bunny'

type ActionResult = { data: true } | { error: string }

// New image / attachment rows whose bytes the client already uploaded to storage
// (in edit mode, under the UPLOADER's own UID folder so the own-folder storage
// INSERT policy covers admins too). The row inserts happen here via the
// service-role client so an admin can write rows for another member's post.
type NewImage = { url: string; storage_path: string }
type NewAttachment = {
  url: string
  storage_path: string
  file_name: string
  file_size: number
}

type UpdatePostInput = {
  postId: string
  title: string
  body: string
  removedImageIds: string[]
  newImages: NewImage[]
  removedAttachmentIds: string[]
  newAttachments: NewAttachment[]
  // Video edits are admin-only (enforced below, not just in the UI). A post can
  // hold several videos since 0017, so edits are expressed as two lists rather
  // than a single keep/remove/replace action:
  //   removedVideoIds — post_videos row ids to delete (DB row + Bunny asset)
  //   newVideoIds     — Bunny ids to append (status 'processing')
  // Both default to empty, which leaves the post's videos untouched.
  removedVideoIds?: string[]
  newVideoIds?: string[]
}

// Author OR admin gate, enforced server-side (the posts RLS from migration 0013
// is the second layer). Returns the post's author + whether the caller is admin
// so callers can branch (e.g. video edits) and revalidate the right paths.
async function requireOwnerOrAdmin(
  postId: string,
): Promise<{ userId: string; authorId: string; isAdmin: boolean } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: post } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .maybeSingle()
  if (!post) {
    return { error: 'Post not found.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = profile?.is_admin === true

  if (user.id !== post.author_id && !isAdmin) {
    return { error: 'You can only edit your own posts.' }
  }

  return { userId: user.id, authorId: post.author_id, isAdmin }
}

// Best-effort Bunny delete: the post outlives the video, so never block on a
// failed external delete — log the id (for manual cleanup) and carry on.
async function tryDeleteBunnyVideo(videoId: string | null | undefined) {
  if (!videoId) return
  try {
    await deleteVideo(videoId)
  } catch (err) {
    console.error(`Failed to delete Bunny video ${videoId}:`, err)
  }
}

export async function updatePost(input: UpdatePostInput): Promise<ActionResult> {
  const auth = await requireOwnerOrAdmin(input.postId)
  if ('error' in auth) return auth

  // All row + storage + Bunny mutations go through the service-role client so a
  // single server-side gate covers both author and admin (sidestepping the
  // author-only post_images / post_attachments / post_videos row RLS).
  const admin = createAdminClient()
  const { postId } = input

  // --- text ---
  const { error: postError } = await admin
    .from('posts')
    .update({
      title: input.title.trim(),
      body: input.body.trim(),
      edited_at: new Date().toISOString(),
    })
    .eq('id', postId)
  if (postError) {
    return { error: postError.message }
  }

  // --- removed images ---
  if (input.removedImageIds.length > 0) {
    const { data: rows } = await admin
      .from('post_images')
      .select('storage_path')
      .eq('post_id', postId)
      .in('id', input.removedImageIds)
    const paths = (rows ?? []).map((r) => r.storage_path)
    if (paths.length > 0) {
      const { error } = await admin.storage.from('post-images').remove(paths)
      if (error) console.error('Failed to remove post-images objects:', error)
    }
    await admin
      .from('post_images')
      .delete()
      .eq('post_id', postId)
      .in('id', input.removedImageIds)
  }

  // --- removed attachments ---
  if (input.removedAttachmentIds.length > 0) {
    const { data: rows } = await admin
      .from('post_attachments')
      .select('storage_path')
      .eq('post_id', postId)
      .in('id', input.removedAttachmentIds)
    const paths = (rows ?? []).map((r) => r.storage_path)
    if (paths.length > 0) {
      const { error } = await admin.storage.from('post-attachments').remove(paths)
      if (error) console.error('Failed to remove post-attachments objects:', error)
    }
    await admin
      .from('post_attachments')
      .delete()
      .eq('post_id', postId)
      .in('id', input.removedAttachmentIds)
  }

  // --- new images (positions appended after the surviving ones) ---
  if (input.newImages.length > 0) {
    const { data: existing } = await admin
      .from('post_images')
      .select('position')
      .eq('post_id', postId)
    let next = (existing ?? []).reduce((m, r) => Math.max(m, r.position + 1), 0)
    const rows = input.newImages.map((img) => ({
      post_id: postId,
      url: img.url,
      storage_path: img.storage_path,
      position: next++,
    }))
    const { error } = await admin.from('post_images').insert(rows)
    if (error) return { error: error.message }
  }

  // --- new attachments ---
  if (input.newAttachments.length > 0) {
    const { data: existing } = await admin
      .from('post_attachments')
      .select('position')
      .eq('post_id', postId)
    let next = (existing ?? []).reduce((m, r) => Math.max(m, r.position + 1), 0)
    const rows = input.newAttachments.map((a) => ({
      post_id: postId,
      url: a.url,
      storage_path: a.storage_path,
      file_name: a.file_name,
      file_size: a.file_size,
      position: next++,
    }))
    const { error } = await admin.from('post_attachments').insert(rows)
    if (error) return { error: error.message }
  }

  // --- videos (admin only) ---
  const removedVideoIds = input.removedVideoIds ?? []
  const newVideoIds = input.newVideoIds ?? []

  if (auth.isAdmin && (removedVideoIds.length > 0 || newVideoIds.length > 0)) {
    // Removals first: drop the rows, then best-effort delete the Bunny assets.
    if (removedVideoIds.length > 0) {
      const { data: rows } = await admin
        .from('post_videos')
        .select('video_id')
        .eq('post_id', postId)
        .in('id', removedVideoIds)

      const { error } = await admin
        .from('post_videos')
        .delete()
        .eq('post_id', postId)
        .in('id', removedVideoIds)
      if (error) return { error: error.message }

      for (const row of rows ?? []) {
        await tryDeleteBunnyVideo(row.video_id)
      }
    }

    // Then append the new ones after whatever survived, preserving order.
    if (newVideoIds.length > 0) {
      const { data: remaining } = await admin
        .from('post_videos')
        .select('position')
        .eq('post_id', postId)
        .order('position', { ascending: false })
        .limit(1)

      const nextPosition = (remaining?.[0]?.position ?? -1) + 1

      const { error } = await admin.from('post_videos').insert(
        newVideoIds.map((videoId, index) => ({
          post_id: postId,
          video_id: videoId,
          video_provider: 'bunny',
          video_status: 'processing',
          position: nextPosition + index,
        })),
      )
      if (error) return { error: error.message }
    }
  }

  revalidatePath('/community', 'layout')
  return { data: true }
}

export async function deletePost({ postId }: { postId: string }): Promise<ActionResult> {
  const auth = await requireOwnerOrAdmin(postId)
  if ('error' in auth) return auth

  const admin = createAdminClient()

  // Gather external assets before the row (and its cascading children) vanish.
  // A post may hold several videos (0017) — no .maybeSingle() here, that would
  // error the moment a post has more than one.
  const { data: videos } = await admin
    .from('post_videos')
    .select('video_id')
    .eq('post_id', postId)
  const { data: images } = await admin
    .from('post_images')
    .select('storage_path')
    .eq('post_id', postId)
  const { data: attachments } = await admin
    .from('post_attachments')
    .select('storage_path')
    .eq('post_id', postId)

  // FK cascade handles the DB rows; external assets do not cascade, so clean
  // them up here. All best-effort — a failure leaves orphaned bytes only.
  for (const row of videos ?? []) {
    await tryDeleteBunnyVideo(row.video_id)
  }

  const imagePaths = (images ?? []).map((r) => r.storage_path)
  if (imagePaths.length > 0) {
    const { error } = await admin.storage.from('post-images').remove(imagePaths)
    if (error) console.error('Failed to remove post-images objects:', error)
  }
  const attachmentPaths = (attachments ?? []).map((r) => r.storage_path)
  if (attachmentPaths.length > 0) {
    const { error } = await admin.storage
      .from('post-attachments')
      .remove(attachmentPaths)
    if (error) console.error('Failed to remove post-attachments objects:', error)
  }

  const { error: deleteError } = await admin.from('posts').delete().eq('id', postId)
  if (deleteError) {
    return { error: deleteError.message }
  }

  revalidatePath('/community', 'layout')
  // The author's member/profile page lists their posts.
  revalidatePath(`/members/${auth.authorId}`)
  return { data: true }
}
