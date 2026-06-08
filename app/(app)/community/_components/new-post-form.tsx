'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'
import { MAX_ATTACHMENT_SIZE_BYTES, PDF_MIME } from '@/lib/attachments'
import { formatFileSize } from '@/lib/format'

type SelectedImage = { file: File; url: string }

export function NewPostForm({
  channelId,
  channelSlug,
}: {
  channelId: string
  channelSlug: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [images, setImages] = useState<SelectedImage[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!body.trim()) {
      setError('Please write something in the body.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
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

      router.push(`/community/${channelSlug}/${postId}`)
    } catch (err) {
      console.error('Failed to create post:', err)
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
      setIsSubmitting(false)
    }
  }

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
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesPicked}
          className="text-sm font-normal text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
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
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handlePdfsPicked}
          className="text-sm font-normal text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
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

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  )
}
