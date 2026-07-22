'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

// Icon-only light/dark toggle for the PUBLIC headers (home / about / profile shell).
// Works logged-out — theme is client-only (next-themes), independent of auth. Compact
// sibling of app/(app)/_components/theme-toggle.tsx (the labelled settings row).
export function ThemeToggleIcon() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // next-themes hydration guard: theme is unknown during SSR.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const label = !mounted
    ? 'Toggle theme'
    : isDark
      ? 'Switch to light mode'
      : 'Switch to dark mode'
  const Icon = isDark ? Sun : Moon

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-fg-secondary transition-colors hover:bg-muted"
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
