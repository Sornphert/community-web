'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Lock, X } from 'lucide-react'
import { PLATFORM_LOGO_URL } from '@/lib/config'
import { TeacherCard } from './teacher-card'

// [Locked community] A non-member's view of a community they can't enter (the
// 'invite_only' and 'discover_public' card states). Clicking opens an info MODAL —
// no navigation, works for logged-out visitors and logged-in non-members alike, all
// on the public /home page. The modal shows the teacher's description and, when set,
// a "Visit website" button to enroll on the teacher's own site. This is deliberately
// SEPARATE from the in-app request-to-join flow (/t/[slug]/join).
type LockedTeacher = {
  slug: string
  name: string
  cover_url: string | null
  logo_url: string | null
  description: string | null
  website_url: string | null
}

export function LockedCommunityCard({
  teacher,
  memberCount,
  state,
}: {
  teacher: LockedTeacher
  memberCount: number
  state: 'invite_only' | 'discover_public'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="block w-full rounded-lg text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TeacherCard teacher={teacher} memberCount={memberCount} state={state} />
      </button>

      {open && <CommunityInfoModal teacher={teacher} onClose={() => setOpen(false)} />}
    </>
  )
}

function CommunityInfoModal({
  teacher,
  onClose,
}: {
  teacher: LockedTeacher
  onClose: () => void
}) {
  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // A logo-less teacher falls back to the NEUTRAL platform logo — never another
  // teacher's brand (mirrors the /join page).
  const logoUrl = teacher.logo_url ?? PLATFORM_LOGO_URL

  // Admins may enter a bare host ("example.com"); ensure an absolute URL so the
  // browser treats it as external, not a relative path. null/blank → no button.
  const rawUrl = teacher.website_url?.trim()
  const websiteHref = rawUrl
    ? /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`
    : null

  // Portal to <body>: the card lives inside the carousel track, which has a CSS
  // transform (its scroll mechanism). A transformed ancestor becomes the containing
  // block for position:fixed, so an in-place modal would anchor to the track (off to
  // the side) instead of the viewport. Portaling out escapes the transform → true
  // viewport-centered overlay.
  return createPortal(
    // Backdrop — click to close.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* Panel — stop propagation so inner clicks don't close it. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={teacher.name}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-lg"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1 text-fg-muted transition-colors hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={teacher.name}
            className="h-16 w-16 rounded-xl object-contain"
          />
          <h2 className="text-lg font-semibold leading-tight text-fg">
            {teacher.name}
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
            <Lock className="h-3 w-3" />
            Invite only
          </span>
        </div>

        {teacher.description && teacher.description.trim() !== '' ? (
          <p className="mt-4 whitespace-pre-wrap break-words text-sm text-fg-secondary">
            {teacher.description}
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-fg-muted">
            This community is invite only.
          </p>
        )}

        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-inverse px-4 py-2.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
          >
            Visit website
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>,
    document.body,
  )
}
