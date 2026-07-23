'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Lock, X } from 'lucide-react'
import { PLATFORM_LOGO_URL } from '@/lib/config'

// The teacher-info popup: brand + description + an optional "Visit website" CTA. Shared
// by the /home locked cards AND the public post gate (/p/[id]), so a non-member always
// gets the SAME "here's the community, enroll on their site" affordance. Deliberately
// separate from the in-app request-to-join flow (/t/[slug]/join).
//
// Only the fields the modal renders are required, so any richer teacher row (the
// directory row, getTeacherBySlug's full Teacher) satisfies it structurally.
export type TeacherInfo = {
  name: string
  logo_url: string | null
  description: string | null
  website_url: string | null
}

export function CommunityInfoModal({
  teacher,
  onClose,
}: {
  teacher: TeacherInfo
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

  // Portal to <body>: callers may render this from inside a CSS-transformed ancestor
  // (e.g. the carousel track), which would otherwise become the containing block for
  // position:fixed and anchor the modal off-screen. Portaling out escapes any transform
  // → a true viewport-centered overlay.
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
          className="absolute right-3 top-3 rounded-full p-1 text-fg-muted transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
