'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import type { MembershipRole } from '@/lib/types'

// Full literal class strings — Tailwind v4 cannot see dynamically built names
// (same constraint as avatar.tsx's bgColors). Used as the cover-band fallback when
// a teacher has no cover_url (or the image fails to load): a stable per-slug color.
const bandColors = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
]

function colorForSlug(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0
  }
  return bandColors[Math.abs(hash) % bandColors.length]
}

// The card's notion of a teacher — a structural subset satisfied by BOTH
// DirectoryTeacher and TeacherWithRole, so the page can pass either.
type CardTeacher = {
  slug: string
  name: string
  cover_url: string | null
  logo_url: string | null
  description: string | null
  website_url: string | null
}

// 'enter'           → joined; the PAGE wraps this card in a <Link> to /t/[slug].
// 'invite_only'     → logged-in non-member; disabled, shows an "Invite only" pill.
// 'discover_public' → logged-out; shown, not clickable, no pill, no Enter.
type CardState = 'enter' | 'invite_only' | 'discover_public'

export function TeacherCard({
  teacher,
  memberCount,
  state,
  role,
}: {
  teacher: CardTeacher
  memberCount: number
  state: CardState
  // Present only for "Your communities" (state='enter') cards; renders an Admin badge.
  role?: MembershipRole
}) {
  // Track image load failures so a broken cover/logo URL falls back cleanly instead
  // of showing the browser's broken-image icon.
  const [coverFailed, setCoverFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  const initial = teacher.name.trim().charAt(0).toUpperCase() || '?'
  const showCover = !!teacher.cover_url && !coverFailed
  const showLogo = !!teacher.logo_url && !logoFailed
  const hasDescription = !!teacher.description && teacher.description.trim() !== ''

  const interactive = state === 'enter'

  return (
    <div
      className={`overflow-hidden rounded-lg border border-line bg-surface transition-shadow ${
        interactive ? 'hover:shadow-md' : ''
      } ${state === 'invite_only' ? 'opacity-75' : ''}`}
    >
      {/* Cover band (hero) with the logo circle overlapping its bottom-left */}
      <div className="relative">
        {showCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={teacher.cover_url as string}
            alt={teacher.name}
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="aspect-[5/2] w-full object-cover"
          />
        ) : (
          <div className={`${colorForSlug(teacher.slug)} aspect-[5/2] w-full`} />
        )}

        <div className="absolute -bottom-6 left-3">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={teacher.logo_url as string}
              alt={teacher.name}
              loading="lazy"
              onError={() => setLogoFailed(true)}
              className="h-12 w-12 rounded-full border-2 border-surface object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-surface bg-muted">
              <span className="text-lg font-semibold text-fg-secondary">
                {initial}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Meta — pt-8 clears the overlapping logo circle */}
      <div className="p-3 pt-8">
        <div className="flex items-center gap-2">
          <p className="line-clamp-1 min-w-0 flex-1 font-medium text-fg">
            {teacher.name}
          </p>
          {state === 'enter' && role === 'admin' && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
              Admin
            </span>
          )}
          {state === 'invite_only' && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
              <Lock className="h-3 w-3" />
              Invite only
            </span>
          )}
        </div>

        {hasDescription && (
          <p className="mt-1 line-clamp-2 text-sm text-fg-muted">
            {teacher.description}
          </p>
        )}

        <p className="mt-2 text-xs text-fg-faint">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </p>
      </div>
    </div>
  )
}
