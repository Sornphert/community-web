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

// Video edits are admin-only (enforced below, not just in the UI):
//   keep    — leave the existing video untouched
//   remove  — delete the existing video (DB row + Bunny asset)
//   replace — delete the existing video, attach newVideoId (status 'processing')
type VideoEdit =
  | { action: 'keep' }
  | { action: 'remove' }
  | { action: 'replace'; newVideoId: string }

type UpdatePostInput = {
  postId: string
  title: string
  body: string
  removedImageIds: string[]
  newImages: NewImage[]
  removedAttachmentIds: string[]
  newAttachments: NewAttachment[]
  video?: VideoEdit
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
    .select('author_id, teacher_id')
    .eq('id', postId)
    .maybeSingle()
  if (!post) {
    return { error: 'Post not found.' }
  }

  // [MT] Admin is per-teacher: resolve via the same is_teacher_admin RPC the RLS
  // uses, keyed by THIS post's teacher_id (never global is_admin).
  const { data: adminFlag } = await supabase.rpc('is_teacher_admin', {
    p_teacher_id: post.teacher_id,
  })
  const isAdmin = adminFlag === true

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

  // --- video (admin only) ---
  if (input.video && input.video.action !== 'keep' && auth.isAdmin) {
    const { data: current } = await admin
      .from('post_videos')
      .select('video_id')
      .eq('post_id', postId)
      .maybeSingle()

    // Remove/replace: delete the existing row FIRST (post_videos has
    // UNIQUE(post_id) — inserting before deleting would violate it), then drop
    // the Bunny asset. For replace, only then insert the new row.
    if (current) {
      await admin.from('post_videos').delete().eq('post_id', postId)
      await tryDeleteBunnyVideo(current.video_id)
    }
    if (input.video.action === 'replace') {
      const { error } = await admin.from('post_videos').insert({
        post_id: postId,
        video_id: input.video.newVideoId,
        video_provider: 'bunny',
        video_status: 'processing',
      })
      if (error) return { error: error.message }
    }
  }

  // Tenant-agnostic: the action doesn't carry the /t/[slug] prefix, and the client
  // also calls router.refresh()/push() after this returns.
  revalidatePath('/', 'layout')
  return { data: true }
}

export async function deletePost({ postId }: { postId: string }): Promise<ActionResult> {
  const auth = await requireOwnerOrAdmin(postId)
  if ('error' in auth) return auth

  const admin = createAdminClient()

  // Gather external assets before the row (and its cascading children) vanish.
  const { data: video } = await admin
    .from('post_videos')
    .select('video_id')
    .eq('post_id', postId)
    .maybeSingle()
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
  await tryDeleteBunnyVideo(video?.video_id)

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

  revalidatePath('/', 'layout')
  return { data: true }
}

// [Surface 2] Author public-consent toggle. Moves ONLY is_public, via the
// set_post_public RPC (0011) whose SECURITY DEFINER body enforces author +
// active-membership; hidden_from_public is the admin kill switch and is NEVER
// touched here. The RPC signals failure TWO ways: a transport error, OR a
// { success:false } JSON payload (authz denials return this WITHOUT throwing) —
// treat either as failure. Revocable in both directions (p_value true|false).
export async function setPostPublic({
  postId,
  isPublic,
}: {
  postId: string
  isPublic: boolean
}): Promise<{ data: { is_public: boolean } } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data, error } = await supabase.rpc('set_post_public', {
    p_post_id: postId,
    p_value: isPublic,
  })
  if (error || (data as { success?: boolean } | null)?.success === false) {
    return { error: 'Failed to update post visibility.' }
  }

  revalidatePath('/', 'layout')
  return { data: { is_public: isPublic } }
}

// [Surface 3] Admin kill switch. Moves ONLY hidden_from_public, via set_post_hidden (0011)
// whose SECURITY DEFINER body enforces is_teacher_admin OF THE POST'S TEACHER (never the
// caller's other memberships) — so viewerIsAdmin is never trusted server-side. Same
// dual-failure convention as setPostPublic (transport error OR { success:false }). Both
// directions (p_value true|false); admin-gated only, no public-state precondition.
export async function setPostHidden({
  postId,
  hidden,
}: {
  postId: string
  hidden: boolean
}): Promise<{ data: { hidden_from_public: boolean } } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data, error } = await supabase.rpc('set_post_hidden', {
    p_post_id: postId,
    p_value: hidden,
  })
  if (error || (data as { success?: boolean } | null)?.success === false) {
    return { error: 'Failed to update post visibility.' }
  }

  revalidatePath('/', 'layout')
  return { data: { hidden_from_public: hidden } }
}

// [Surface 3] Admin prominence flag. Moves ONLY featured, via set_post_featured (0011).
// The RPC REJECTS featuring (p_value=true) a not-currently-public post with error
// 'not_public' (predicate: is_public AND NOT hidden_from_public); unfeature is always
// allowed once admin. We PROPAGATE not_public distinctly so the client can show a
// race-specific message (the UI already disables Feature when !canFeature, so this only
// fires on a concurrent public/hidden change). not_authorized + transport collapse to the
// generic message.
export async function setPostFeatured({
  postId,
  featured,
}: {
  postId: string
  featured: boolean
}): Promise<{ data: { featured: boolean } } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data, error } = await supabase.rpc('set_post_featured', {
    p_post_id: postId,
    p_value: featured,
  })
  const payload = data as { success?: boolean; error?: string } | null
  if (error || payload?.success === false) {
    if (!error && payload?.error === 'not_public') {
      return { error: 'not_public' }
    }
    return { error: 'Failed to update featured state.' }
  }

  revalidatePath('/', 'layout')
  return { data: { featured } }
}
