'use client'

import { useState } from 'react'
import type { MembershipRole } from '@/lib/types'

// Full literal class strings — Tailwind v4 cannot see dynamically built names
// (same constraint as avatar.tsx's bgColors). Used as the fallback when a teacher
// has no cover_url (or the image fails to load): a stable per-slug color.
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
// 'invite_only'     → logged-in non-member; the LockedCommunityCard opens a modal.
// 'discover_public' → logged-out; the LockedCommunityCard opens a modal.
type CardState = 'enter' | 'invite_only' | 'discover_public'

// A bare photo card: the teacher's cover image ONLY, no meta panel. Identity/CTA
// live elsewhere — clicking an 'enter' card enters the community, and a locked card
// opens the info modal (name + description + Visit website). memberCount/role are
// kept in the prop type for call-site compatibility but intentionally unrendered.
export function TeacherCard({
  teacher,
}: {
  teacher: CardTeacher
  memberCount: number
  state: CardState
  role?: MembershipRole
}) {
  const [coverFailed, setCoverFailed] = useState(false)
  const showCover = !!teacher.cover_url && !coverFailed
  const initial = teacher.name.trim().charAt(0).toUpperCase() || '?'

  // Every state is clickable (enter → community, locked → info modal). On hover the
  // card grows slightly and lifts above its neighbours (relative + z) to signal it's
  // clickable — the carousel viewport has vertical padding so the grown card isn't
  // clipped.
  return (
    // Hover: grow + a soft SYMMETRIC glow (no directional offset, so no hard cut-off
    // line) that fits inside the carousel's vertical padding. ~20px blur < the py-6
    // room on the viewport, so it isn't clipped.
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface transition-all duration-200 will-change-transform hover:z-10 hover:scale-[1.1] hover:shadow-[0_0_20px_rgba(0,0,0,0.22)] dark:hover:shadow-[0_0_22px_rgba(255,255,255,0.28)]">
      {showCover ? (
        // draggable=false + user-drag none: without these, dragging the carousel by a
        // real cover image triggers the browser's native image-drag (you can drop the
        // photo elsewhere) instead of scrolling. The coverless colored div has no such
        // issue, which is why only Empty Academy worked before.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={teacher.cover_url as string}
          alt={teacher.name}
          loading="lazy"
          draggable={false}
          onError={() => setCoverFailed(true)}
          className="aspect-[3/2] w-full select-none object-cover [-webkit-user-drag:none]"
        />
      ) : (
        // No cover: colored band with the initial, so a coverless teacher isn't a
        // blank rectangle. The name is still exposed to screen readers.
        <div
          className={`${colorForSlug(teacher.slug)} flex aspect-[3/2] w-full items-center justify-center`}
        >
          <span className="text-4xl font-semibold text-white/90">{initial}</span>
          <span className="sr-only">{teacher.name}</span>
        </div>
      )}
    </div>
  )
}
