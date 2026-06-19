import type { MembershipRole } from '@/lib/types'

// Full literal class strings — Tailwind v4 cannot see dynamically built names
// (same constraint as avatar.tsx's bgColors). `teachers` has no branding column
// yet, so the band color is derived deterministically from the slug: stable per
// teacher, and consistent across the "Your communities" and "Discover" sections.
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

export function TeacherCard({
  name,
  slug,
  role,
}: {
  name: string
  slug: string
  // Present only for "Your communities" cards; renders an Admin badge.
  role?: MembershipRole
}) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface transition-shadow hover:shadow-md">
      <div
        className={`${colorForSlug(slug)} flex aspect-[5/2] items-center justify-center`}
      >
        <span className="text-4xl font-semibold text-white">{initial}</span>
      </div>

      <div className="flex items-center gap-2 p-3">
        <p className="line-clamp-1 min-w-0 flex-1 font-medium text-fg">{name}</p>
        {role === 'admin' && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
            Admin
          </span>
        )}
      </div>
    </div>
  )
}
