'use client'

import Image from 'next/image'

type Size = 'sm' | 'md' | 'lg'

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

const sizePx: Record<Size, number> = {
  sm: 32,
  md: 40,
  lg: 56,
}

// Full literal class strings — Tailwind v4 can't see dynamically built names.
const bgColors = [
  'bg-rose-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-pink-500',
]

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return bgColors[Math.abs(hash) % bgColors.length]
}

export function Avatar({
  url,
  name,
  size = 'md',
}: {
  url: string | null
  name: string
  size?: Size
}) {
  const dimensions = sizeClasses[size]

  if (url) {
    return (
      <Image
        src={url}
        alt={name}
        width={sizePx[size]}
        height={sizePx[size]}
        unoptimized
        className={`${dimensions} shrink-0 rounded-full object-cover`}
      />
    )
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`${dimensions} ${colorForName(name)} flex shrink-0 items-center justify-center rounded-full font-medium text-white`}
      aria-label={name}
    >
      {initial}
    </div>
  )
}
