'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/app/_components/toast'
import { convertToJpg } from '@/lib/image'
import {
  MentionTextarea,
  type MentionMember,
} from '@/app/(app)/_components/mention-textarea'

type PickedImage = { file: File; preview: string }

const MAX_IMAGES = 4

export function CommentForm({
  postId,
  members,
  canMentionAll,
}: {
  postId: string
  members: MentionMember[]
  canMentionAll: boolean
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [body, setBody] = useState('')
  const [images, setImages] = useState<PickedImage[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      setImages((prev) =>
        [
          ...prev,
          ...files.map((file) => ({ file, preview: URL.createObjectURL(file) })),
        ].slice(0, MAX_IMAGES),
      )
    }
    e.target.value = ''
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() && images.length === 0) return

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('You must be signed in to comment.')
      }

      // id up front so images upload under the comment's own folder first.
      const commentId = crypto.randomUUID()

      const imageRows: {
        comment_id: string
        url: string
        storage_path: string
        position: number
      }[] = []
      for (let index = 0; index < images.length; index++) {
        const blob = await convertToJpg(images[index].file)
        const path = `${user.id}/${commentId}/${index}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('comment-images')
          .upload(path, blob, { contentType: 'image/jpeg' })
        if (uploadError) throw uploadError
        const url = supabase.storage.from('comment-images').getPublicUrl(path)
          .data.publicUrl
        imageRows.push({
          comment_id: commentId,
          url,
          storage_path: path,
          position: index,
        })
      }

      const { error: insertError } = await supabase.from('comments').insert({
        id: commentId,
        post_id: postId,
        author_id: user.id,
        body: body.trim(),
      })
      if (insertError) throw insertError

      if (imageRows.length > 0) {
        const { error: imgError } = await supabase
          .from('comment_images')
          .insert(imageRows)
        if (imgError) throw imgError
      }

      images.forEach((img) => URL.revokeObjectURL(img.preview))
      setBody('')
      setImages([])
      router.refresh()
      showToast('Comment posted', 'success')
    } catch (err) {
      console.error('Failed to post comment:', err)
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <MentionTextarea
        value={body}
        onChange={setBody}
        members={members}
        canMentionAll={canMentionAll}
        rows={3}
        placeholder="Write a comment… use @ to mention"
        className="w-full rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, index) => (
            <div key={index} className="relative h-20 w-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.preview}
                alt=""
                className="h-20 w-20 rounded-md object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-inverse text-inverse-fg"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-fg-secondary transition-colors hover:bg-muted ${
            images.length >= MAX_IMAGES ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          <ImagePlus className="h-4 w-4" />
          Add image
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onPickImages}
            disabled={images.length >= MAX_IMAGES}
            className="hidden"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting || (!body.trim() && images.length === 0)}
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
        >
          {isSubmitting ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </form>
  )
}
