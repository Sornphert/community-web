'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Image as ImageIcon, Upload as UploadIcon, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'
import { formatFileSize } from '@/lib/format'
import {
  CONTENT_FILES_BUCKET,
  MAX_CONTENT_FILE_SIZE_BYTES,
  isAllowedLessonFile,
  resolveLessonUpload,
} from '@/lib/content-files'
import { isAllowedCoverImage } from '@/lib/topic-covers'
import { uploadTopicCover } from '@/lib/topic-cover-upload'
import type { Topic } from '@/lib/types'
import { createDocumentLesson, createTopic } from '../actions'

const NEW_TOPIC = '__new__'

const inputClass =
  'rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring'

export function DocumentLessonForm({
  topics,
  teacherId,
  uid,
}: {
  topics: Topic[]
  teacherId: string
  uid: string
}) {
  const router = useRouter()
  const [topicMode, setTopicMode] = useState<string>(topics[0]?.id ?? NEW_TOPIC)
  const [newTopicName, setNewTopicName] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file after removal
    if (!picked) return

    if (!isAllowedLessonFile(picked)) {
      setError('Only images, PDF, and Excel files are allowed.')
      return
    }
    if (picked.size > MAX_CONTENT_FILE_SIZE_BYTES) {
      setError(
        `File is too large. Max ${formatFileSize(MAX_CONTENT_FILE_SIZE_BYTES)}.`,
      )
      return
    }
    setError(null)
    setFile(picked)
  }

  function handleCoverPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file after removal
    if (!picked) return

    if (!isAllowedCoverImage(picked)) {
      setError('The cover must be an image file.')
      return
    }
    setError(null)
    setCoverFile(picked)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!title.trim()) {
      setError('Please enter a title.')
      return
    }
    if (!file) {
      setError('Please choose a PDF, image, or Excel file.')
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()

      // Resolve the parent topic — create it first if in new-topic mode.
      let topicId = topicMode
      if (topicMode === NEW_TOPIC) {
        if (!newTopicName.trim()) {
          setError('Please enter a name for the new topic.')
          setIsSubmitting(false)
          return
        }
        // Optional cover — upload to topic-covers first, then attach on create.
        let coverImageUrl: string | null = null
        let coverStoragePath: string | null = null
        if (coverFile) {
          const cover = await uploadTopicCover(coverFile, teacherId, uid)
          coverImageUrl = cover.url
          coverStoragePath = cover.path
        }
        const result = await createTopic({
          teacherId,
          name: newTopicName,
          coverImageUrl,
          coverStoragePath,
        })
        if (result.error || !result.topic) {
          throw new Error(result.error ?? 'Could not create the topic.')
        }
        topicId = result.topic.id
      }

      // Resolve the real extension + content-type per file type. Images are
      // converted to JPEG (app-wide convention); PDF and Excel upload as-is.
      // No "else → PDF" default: an unrecognized type is rejected outright so a
      // spreadsheet is never silently stored as a .pdf.
      const upload = resolveLessonUpload(file)
      if (!upload) {
        throw new Error('Unsupported file type. Use an image, PDF, or Excel file.')
      }
      const body: Blob = upload.isImage ? await convertToJpg(file) : file
      // [MT] content-files RLS checks ONLY segment [1] of the path
      // (is_teacher_admin(((storage.foldername(name))[1])::uuid)). Segment [1] MUST be
      // teacherId — load-bearing for the write check. The {uid} segment is COSMETIC
      // (parity with the Community storage path helper); do NOT build a per-uid
      // boundary on it — this bucket has no [2]=auth.uid() check.
      const path = `${teacherId}/${uid}/lessons/${crypto.randomUUID()}.${upload.ext}`

      const { error: uploadError } = await supabase.storage
        .from(CONTENT_FILES_BUCKET)
        .upload(path, body, { contentType: upload.contentType })
      if (uploadError) {
        throw uploadError
      }

      const url = supabase.storage
        .from(CONTENT_FILES_BUCKET)
        .getPublicUrl(path).data.publicUrl

      const result = await createDocumentLesson({
        teacherId,
        topicId,
        title,
        description,
        documentUrl: url,
        documentStoragePath: path,
        // For images, reuse the file URL as the thumbnail so it previews inline.
        thumbnailUrl: upload.isImage ? url : null,
      })
      if (result.error) {
        throw new Error(result.error)
      }

      // Reset for the next upload, keeping the selected topic.
      setTitle('')
      setDescription('')
      setFile(null)
      if (topicMode === NEW_TOPIC) {
        setTopicMode(topicId)
        setNewTopicName('')
        setCoverFile(null)
      }
      setSuccess('Lesson uploaded.')
      router.refresh()
    } catch (err) {
      console.error('Failed to create document lesson:', err)
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Topic
        <select
          value={topicMode}
          onChange={(e) => setTopicMode(e.target.value)}
          className={inputClass}
        >
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
          <option value={NEW_TOPIC}>+ New topic…</option>
        </select>
      </label>

      {topicMode === NEW_TOPIC && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
            New topic name
            <input
              type="text"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
            Cover image (optional)
            {coverFile ? (
              <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <ImageIcon className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-sm font-normal text-fg">
                  {coverFile.name}
                </span>
                <span className="shrink-0 text-xs font-normal text-fg-muted">
                  {formatFileSize(coverFile.size)}
                </span>
                <button
                  type="button"
                  onClick={() => setCoverFile(null)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
                  aria-label="Remove cover image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 py-4 text-sm font-normal text-fg-secondary hover:bg-hover-subtle">
                <UploadIcon className="h-4 w-4" />
                Choose a cover image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverPicked}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm font-medium text-fg-secondary">
        File (PDF, image, or Excel)
        {file ? (
          <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-normal text-fg">
              {file.name}
            </span>
            <span className="shrink-0 text-xs font-normal text-fg-muted">
              {formatFileSize(file.size)}
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted hover:text-fg"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 py-4 text-sm font-normal text-fg-secondary hover:bg-hover-subtle">
            <UploadIcon className="h-4 w-4" />
            Choose a PDF, image, or Excel file
            <input
              type="file"
              accept="image/*,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFilePicked}
              className="hidden"
            />
          </label>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success-text">
          {success}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
        >
          {isSubmitting ? 'Uploading…' : 'Upload lesson'}
        </button>
      </div>
    </form>
  )
}
