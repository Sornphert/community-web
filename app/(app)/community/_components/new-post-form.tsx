'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'
import { MAX_ATTACHMENT_SIZE_BYTES, PDF_MIME } from '@/lib/attachments'
import { formatFileSize } from '@/lib/format'
import { updatePost } from '../_actions/posts'
import { PostVideoUpload } from './post-video-upload'
import { PostVideoPlayer } from './post-video-player'

type SelectedImage = { file: File; url: string }

// Existing media for edit mode (already persisted rows).
type ExistingImage = { id: string; url: string }
type ExistingAttachment = {
  id: string
  url: string
  file_name: string
  file_size: number
}

// The post being edited. Absent in create mode (the form then behaves exactly as
// before). channelId / channelSlug for the post are passed via the top-level
// props in both modes; channel is NOT editable.
export type EditPost = {
  id: string
  title: string
  body: string
  images: ExistingImage[]
  attachments: ExistingAttachment[]
  // Existing video for the read-only player + admin remove/replace controls.
  video: {
    status: string | null
    playerUrl: string
    posterUrl: string | null
  } | null
}

export function NewPostForm({
  channelId,
  channelSlug,
  isAdmin,
  initialPost,
}: {
  channelId: string
  channelSlug: string
  isAdmin: boolean
  initialPost?: EditPost
}) {
  const router = useRouter()
  const isEdit = !!initialPost

  const [title, setTitle] = useState(initialPost?.title ?? '')
  const [body, setBody] = useState(initialPost?.body ?? '')

  // Newly picked files (both modes).
  const [images, setImages] = useState<SelectedImage[]>([])
  const [attachments, setAttachments] = useState<File[]>([])

  // Edit mode: surviving existing media + the ids the user removed.
  const [existingImages, setExistingImages] = useState<ExistingImage[]>(
    initialPost?.images ?? [],
  )
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([])
  const [existingAttachments, setExistingAttachments] = useState<
    ExistingAttachment[]
  >(initialPost?.attachments ?? [])
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([])

  // Optional Bunny video (admin-only). videoId is set once a NEW upload finishes
  // (a create attach, or an edit-mode replace); videoUploading disables submit
  // while the byte upload is in flight. removeExistingVideo drops the current
  // video without uploading a replacement (edit mode).
  const [videoId, setVideoId] = useState<string | null>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [removeExistingVideo, setRemoveExistingVideo] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set if a CREATE saved but the video attach failed — we show a link to the
  // created post instead of the submit button (avoids a duplicate re-post).
  const [createdPostUrl, setCreatedPostUrl] = useState<string | null>(null)

  // Mirror the current selection in a ref so the unmount cleanup can revoke
  // every outstanding object URL without re-running on each change.
  const imagesRef = useRef<SelectedImage[]>([])
  useEffect(() => {
    imagesRef.current = images
  }, [images])
  useEffect(() => {
    return () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url))
  }, [])

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : []
    if (picked.length > 0) {
      setImages((prev) => [
        ...prev,
        ...picked.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ])
    }
    // Reset so the same file can be re-picked after removal.
    e.target.value = ''
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index]
      if (target) {
        URL.revokeObjectURL(target.url)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  function removeExistingImage(id: string) {
    setExistingImages((prev) => prev.filter((img) => img.id !== id))
    setRemovedImageIds((prev) => [...prev, id])
  }

  function handlePdfsPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : []
    // Client-side validation is UX only — the bucket is the real size gate.
    const valid = picked.filter(
      (file) => file.type === PDF_MIME && file.size <= MAX_ATTACHMENT_SIZE_BYTES,
    )
    if (valid.length < picked.length) {
      setError(
        `Some files were skipped. PDFs only, up to ${formatFileSize(
          MAX_ATTACHMENT_SIZE_BYTES,
        )} each.`,
      )
    }
    if (valid.length > 0) {
      setAttachments((prev) => [...prev, ...valid])
    }
    // Reset so the same file can be re-picked after removal.
    e.target.value = ''
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  function removeExistingAttachment(id: string) {
    setExistingAttachments((prev) => prev.filter((a) => a.id !== id))
    setRemovedAttachmentIds((prev) => [...prev, id])
  }

  async function handleCreate() {
    const postId = crypto.randomUUID()
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('You must be signed in to post.')
    }

    const imageRows: {
      post_id: string
      url: string
      storage_path: string
      position: number
    }[] = []

    for (let index = 0; index < images.length; index++) {
      const blob = await convertToJpg(images[index].file)
      const path = `${user.id}/${postId}/${index}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(path, blob, { contentType: 'image/jpeg' })
      if (uploadError) {
        throw uploadError
      }

      const url = supabase.storage.from('post-images').getPublicUrl(path).data
        .publicUrl
      imageRows.push({ post_id: postId, url, storage_path: path, position: index })
    }

    const { error: postError } = await supabase.from('posts').insert({
      id: postId,
      author_id: user.id,
      title: title.trim(),
      body: body.trim(),
      channel_id: channelId,
    })
    if (postError) {
      throw postError
    }

    if (imageRows.length > 0) {
      const { error: imagesError } = await supabase
        .from('post_images')
        .insert(imageRows)
      if (imagesError) {
        throw imagesError
      }
    }

    const attachmentRows: {
      post_id: string
      url: string
      storage_path: string
      file_name: string
      file_size: number
      position: number
    }[] = []

    for (let index = 0; index < attachments.length; index++) {
      const file = attachments[index]
      const path = `${user.id}/${postId}/${index}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('post-attachments')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadError) {
        throw uploadError
      }

      const url = supabase.storage.from('post-attachments').getPublicUrl(path)
        .data.publicUrl
      attachmentRows.push({
        post_id: postId,
        url,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        position: index,
      })
    }

    if (attachmentRows.length > 0) {
      const { error: attachmentsError } = await supabase
        .from('post_attachments')
        .insert(attachmentRows)
      if (attachmentsError) {
        throw attachmentsError
      }
    }

    const postUrl = `/community/${channelSlug}/${postId}`

    // Attach the optional video LAST, and never let its failure break the post:
    // the post is already saved at this point. On failure, log it, keep the
    // user here with a clear message + a link to the (orphaned-video) post,
    // rather than throwing or navigating away silently.
    if (videoId) {
      const { error: videoError } = await supabase.from('post_videos').insert({
        post_id: postId,
        video_id: videoId,
        video_provider: 'bunny',
        video_status: 'processing',
      })
      if (videoError) {
        console.error('Post saved, but attaching the video failed:', videoError)
        setError(
          'Your post was published, but the video could not be attached. You can open the post below.',
        )
        setCreatedPostUrl(postUrl)
        setIsSubmitting(false)
        return
      }
    }

    router.push(postUrl)
  }

  async function handleEdit() {
    if (!initialPost) return
    const postId = initialPost.id
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('You must be signed in to edit.')
    }

    // Upload new bytes under the UPLOADER's own UID folder (random filenames so
    // they never collide with existing objects); the row inserts happen in the
    // updatePost server action.
    const newImages: { url: string; storage_path: string }[] = []
    for (const img of images) {
      const blob = await convertToJpg(img.file)
      const path = `${user.id}/${postId}/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(path, blob, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      const url = supabase.storage.from('post-images').getPublicUrl(path).data
        .publicUrl
      newImages.push({ url, storage_path: path })
    }

    const newAttachments: {
      url: string
      storage_path: string
      file_name: string
      file_size: number
    }[] = []
    for (const file of attachments) {
      const path = `${user.id}/${postId}/${crypto.randomUUID()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('post-attachments')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadError) throw uploadError
      const url = supabase.storage.from('post-attachments').getPublicUrl(path)
        .data.publicUrl
      newAttachments.push({
        url,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
      })
    }

    // Video edits are admin-only. A new upload replaces (or adds); an explicit
    // remove drops it; otherwise keep it untouched.
    const video = isAdmin
      ? videoId
        ? ({ action: 'replace', newVideoId: videoId } as const)
        : removeExistingVideo
          ? ({ action: 'remove' } as const)
          : ({ action: 'keep' } as const)
      : undefined

    const result = await updatePost({
      postId,
      title,
      body,
      removedImageIds,
      newImages,
      removedAttachmentIds,
      newAttachments,
      video,
    })

    if ('error' in result) {
      throw new Error(result.error)
    }

    const postUrl = `/community/${channelSlug}/${postId}`
    router.push(postUrl)
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!body.trim()) {
      setError('Please write something in the body.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (isEdit) {
        await handleEdit()
      } else {
        await handleCreate()
      }
    } catch (err) {
      console.error(isEdit ? 'Failed to update post:' : 'Failed to create post:', err)
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
      setIsSubmitting(false)
    }
  }

  // Whether to show the existing video (edit mode, not flagged for removal, no
  // pending replacement upload).
  const showExistingVideo =
    isEdit && !!initialPost?.video && !removeExistingVideo && !videoId

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Body *
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={5}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
        />
      </label>

      <div className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Images
        {/* Edit mode: existing images with a remove control. */}
        {existingImages.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {existingImages.map((image) => (
              <div key={image.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="aspect-square w-full rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExistingImage(image.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesPicked}
          className="mt-2 text-sm font-normal text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
        />
        {images.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {images.map((image, index) => (
              <div key={image.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="aspect-square w-full rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
        Attach PDF
        {/* Edit mode: existing attachments with a remove control. */}
        {existingAttachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {existingAttachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-normal text-zinc-900">
                  {file.file_name}
                </span>
                <span className="shrink-0 text-xs font-normal text-zinc-500">
                  {formatFileSize(file.file_size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeExistingAttachment(file.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="Remove PDF"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handlePdfsPicked}
          className="mt-2 text-sm font-normal text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
        />
        {attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {attachments.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-normal text-zinc-900">
                  {file.name}
                </span>
                <span className="shrink-0 text-xs font-normal text-zinc-500">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  aria-label="Remove PDF"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit mode, non-admin author: existing video is read-only (no controls)
          so the author can see it's still attached. */}
      {showExistingVideo && !isAdmin && (
        <PostVideoPlayer
          playerUrl={initialPost!.video!.playerUrl}
          posterUrl={initialPost!.video!.posterUrl}
          status={initialPost!.video!.status}
        />
      )}

      {/* Admin video controls (create attach, or edit replace/remove). */}
      {isAdmin && (
        <div className="flex flex-col gap-2">
          {showExistingVideo && (
            <div className="flex flex-col gap-2">
              <PostVideoPlayer
                playerUrl={initialPost!.video!.playerUrl}
                posterUrl={initialPost!.video!.posterUrl}
                status={initialPost!.video!.status}
              />
              <button
                type="button"
                onClick={() => setRemoveExistingVideo(true)}
                className="self-start text-sm font-medium text-red-600 hover:underline"
              >
                Remove video
              </button>
            </div>
          )}
          {!showExistingVideo && (
            <PostVideoUpload
              title={title}
              onUploadingChange={setVideoUploading}
              onUploaded={setVideoId}
              onCleared={() => setVideoId(null)}
            />
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        {createdPostUrl ? (
          <Link
            href={createdPostUrl}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            View your post
          </Link>
        ) : (
          <button
            type="submit"
            disabled={isSubmitting || videoUploading}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {isSubmitting
              ? isEdit
                ? 'Saving…'
                : 'Posting…'
              : videoUploading
                ? 'Uploading video…'
                : isEdit
                  ? 'Save changes'
                  : 'Post'}
          </button>
        )}
      </div>
    </form>
  )
}
