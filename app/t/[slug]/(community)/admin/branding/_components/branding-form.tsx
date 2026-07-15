'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload as UploadIcon } from 'lucide-react'
import {
  isAllowedBrandingImage,
  MAX_TEACHER_DESCRIPTION_LEN,
  MAX_TEACHER_NAME_LEN,
  MAX_TEACHER_WEBSITE_URL_LEN,
} from '@/lib/teacher-branding'
import { uploadTeacherCover } from '@/lib/teacher-cover-upload'
import { uploadTeacherLogo } from '@/lib/teacher-logo-upload'
import {
  updateTeacherCover,
  updateTeacherLogo,
  updateTeacherDescription,
  updateTeacherName,
  updateTeacherWebsite,
} from '../actions'

type Message = { type: 'success' | 'error'; text: string }

export function BrandingForm({
  teacherId,
  name,
  coverUrl,
  logoUrl,
  description,
  websiteUrl,
}: {
  teacherId: string
  name: string
  coverUrl: string | null
  logoUrl: string | null
  description: string | null
  websiteUrl: string | null
}) {
  const router = useRouter()

  const [communityName, setCommunityName] = useState(name)
  const [savingName, setSavingName] = useState(false)
  const [nameMessage, setNameMessage] = useState<Message | null>(null)

  const [savingCover, setSavingCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)

  const [savingLogo, setSavingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  const [desc, setDesc] = useState(description ?? '')
  const [savingDesc, setSavingDesc] = useState(false)
  const [descMessage, setDescMessage] = useState<Message | null>(null)

  const [website, setWebsite] = useState(websiteUrl ?? '')
  const [savingWebsite, setSavingWebsite] = useState(false)
  const [websiteMessage, setWebsiteMessage] = useState<Message | null>(null)

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

  // Community name — explicit Save button.
  async function handleSaveName() {
    setNameMessage(null)
    setSavingName(true)
    try {
      const result = await updateTeacherName({ teacherId, name: communityName })
      if (result.error) {
        throw new Error(result.error)
      }
      // Reflect the trimmed value the server actually stored.
      setCommunityName(result.teacher?.name ?? communityName)
      router.refresh()
      setNameMessage({ type: 'success', text: 'Saved' })
    } catch (err) {
      console.error('Failed to update teacher name:', err)
      setNameMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      })
    } finally {
      setSavingName(false)
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

  // Website URL — explicit Save button.
  async function handleSaveWebsite() {
    setWebsiteMessage(null)
    setSavingWebsite(true)
    try {
      const result = await updateTeacherWebsite({ teacherId, websiteUrl: website })
      if (result.error) {
        throw new Error(result.error)
      }
      // Reflect the trimmed/null-normalized value the server actually stored.
      setWebsite(result.teacher?.website_url ?? '')
      router.refresh()
      setWebsiteMessage({ type: 'success', text: 'Saved' })
    } catch (err) {
      console.error('Failed to update teacher website:', err)
      setWebsiteMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      })
    } finally {
      setSavingWebsite(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Community name */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Community name</h2>
          <p className="text-xs text-fg-muted">
            The name shown in your community and on your directory card.
          </p>
        </div>

        <input
          type="text"
          value={communityName}
          onChange={(e) => setCommunityName(e.target.value)}
          maxLength={MAX_TEACHER_NAME_LEN}
          placeholder="Your community name"
          className="rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-faint">
            {communityName.length}/{MAX_TEACHER_NAME_LEN}
          </span>
          {nameMessage && (
            <span
              className={`text-sm ${
                nameMessage.type === 'success' ? 'text-success' : 'text-danger'
              }`}
            >
              {nameMessage.text}
            </span>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveName}
            disabled={savingName}
            className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

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

      {/* Website */}
      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Website</h2>
          <p className="text-xs text-fg-muted">
            The &ldquo;Visit website&rdquo; link shown to non-members who tap your
            community card. Leave blank to hide the button.
          </p>
        </div>

        <input
          type="url"
          inputMode="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          maxLength={MAX_TEACHER_WEBSITE_URL_LEN}
          placeholder="https://your-site.com"
          className="rounded-md border border-line-strong px-3 py-2 text-sm text-fg outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-faint">
            {website.length}/{MAX_TEACHER_WEBSITE_URL_LEN}
          </span>
          {websiteMessage && (
            <span
              className={`text-sm ${
                websiteMessage.type === 'success' ? 'text-success' : 'text-danger'
              }`}
            >
              {websiteMessage.text}
            </span>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveWebsite}
            disabled={savingWebsite}
            className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover disabled:opacity-50"
          >
            {savingWebsite ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  )
}
