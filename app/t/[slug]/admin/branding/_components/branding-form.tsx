'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload as UploadIcon } from 'lucide-react'
import {
  isAllowedBrandingImage,
  MAX_TEACHER_DESCRIPTION_LEN,
} from '@/lib/teacher-branding'
import { uploadTeacherCover } from '@/lib/teacher-cover-upload'
import { uploadTeacherLogo } from '@/lib/teacher-logo-upload'
import {
  updateTeacherCover,
  updateTeacherLogo,
  updateTeacherDescription,
} from '../actions'

type Message = { type: 'success' | 'error'; text: string }

export function BrandingForm({
  teacherId,
  coverUrl,
  logoUrl,
  description,
}: {
  teacherId: string
  coverUrl: string | null
  logoUrl: string | null
  description: string | null
}) {
  const router = useRouter()

  const [savingCover, setSavingCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)

  const [savingLogo, setSavingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  const [desc, setDesc] = useState(description ?? '')
  const [savingDesc, setSavingDesc] = useState(false)
  const [descMessage, setDescMessage] = useState<Message | null>(null)

  // Cover (hero) — auto-save on pick (topic-cover-row flow).
  async function handleCoverPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = '' // allow re-picking the same file
    if (!picked) return

    if (!isAllowedBrandingImage(picked)) {
      setCoverError('The cover must be an image file.')
      return
    }

    setCoverError(null)
    setSavingCover(true)
    try {
      const { url, path } = await uploadTeacherCover(picked, teacherId)
      const result = await updateTeacherCover({
        teacherId,
        coverUrl: url,
        coverStoragePath: path,
      })
      if (result.error) {
        throw new Error(result.error)
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to update teacher cover:', err)
      setCoverError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.',
      )
    } finally {
      setSavingCover(false)
    }
  }

  // Logo — auto-save on pick.
  async function handleLogoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!picked) return

    if (!isAllowedBrandingImage(picked)) {
      setLogoError('The logo must be an image file.')
      return
    }

    setLogoError(null)
    setSavingLogo(true)
    try {
      const { url, path } = await uploadTeacherLogo(picked, teacherId)
      const result = await updateTeacherLogo({
        teacherId,
        logoUrl: url,
        logoStoragePath: path,
      })
      if (result.error) {
        throw new Error(result.error)
      }
      router.refresh()
    } catch (err) {
      console.error('Failed to update teacher logo:', err)
      setLogoError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.',
      )
    } finally {
      setSavingLogo(false)
    }
  }

  // Description — explicit Save button.
  async function handleSaveDescription() {
    setDescMessage(null)
    setSavingDesc(true)
    try {
      const result = await updateTeacherDescription({ teacherId, description: desc })
      if (result.error) {
        throw new Error(result.error)
      }
      // Reflect the trimmed/null-normalized value the server actually stored.
      setDesc(result.teacher?.description ?? '')
      router.refresh()
      setDescMessage({ type: 'success', text: 'Saved' })
    } catch (err) {
      console.error('Failed to update teacher description:', err)
      setDescMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      })
    } finally {
      setSavingDesc(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cover (hero) */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Cover image</h2>
          <p className="text-xs text-fg-muted">
            The wide hero banner on your community card.
          </p>
        </div>

        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt="Cover"
            className="aspect-[5/2] w-full rounded object-cover"
          />
        ) : (
          <div className="flex aspect-[5/2] w-full items-center justify-center rounded bg-muted">
            <span className="text-xs font-medium text-fg-muted">No cover yet</span>
          </div>
        )}

        {coverError && <p className="text-xs text-danger-text">{coverError}</p>}

        <label
          className={`flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary hover:bg-hover-subtle ${
            savingCover ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <UploadIcon className="h-4 w-4" />
          {savingCover ? 'Saving…' : coverUrl ? 'Change cover' : 'Add cover'}
          <input
            type="file"
            accept="image/*"
            onChange={handleCoverPicked}
            disabled={savingCover}
            className="hidden"
          />
        </label>
      </section>

      {/* Logo */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Logo</h2>
          <p className="text-xs text-fg-muted">
            A square logo or avatar for your community.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Logo"
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
              <span className="px-1 text-center text-[10px] font-medium text-fg-muted">
                No logo
              </span>
            </div>
          )}

          <label
            className={`flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-fg-secondary hover:bg-hover-subtle ${
              savingLogo ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <UploadIcon className="h-4 w-4" />
            {savingLogo ? 'Saving…' : logoUrl ? 'Change logo' : 'Add logo'}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoPicked}
              disabled={savingLogo}
              className="hidden"
            />
          </label>
        </div>

        {logoError && <p className="text-xs text-danger-text">{logoError}</p>}
      </section>

      {/* Description */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Description</h2>
          <p className="text-xs text-fg-muted">
            A short blurb shown on your community card.
          </p>
        </div>

        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          maxLength={MAX_TEACHER_DESCRIPTION_LEN}
          placeholder="Tell people what your community is about"
          className="rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-faint">
            {desc.length}/{MAX_TEACHER_DESCRIPTION_LEN}
          </span>
          {descMessage && (
            <span
              className={`text-sm ${
                descMessage.type === 'success' ? 'text-success' : 'text-danger'
              }`}
            >
              {descMessage.text}
            </span>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveDescription}
            disabled={savingDesc}
            className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            {savingDesc ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}
