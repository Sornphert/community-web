'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle({
  variant = 'full',
}: {
  variant?: 'full' | 'icon'
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Canonical next-themes hydration guard: theme is unknown during SSR, so we
  // render a stable placeholder until mounted. This is the one legitimate case
  // for a synchronous setState in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  // Stable placeholder until mounted to avoid hydration mismatch (theme is
  // only known on the client).
  const label = !mounted
    ? 'Toggle theme'
    : isDark
      ? 'Switch to light mode'
      : 'Switch to dark mode'

  const Icon = isDark ? Sun : Moon

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label={label}
        title={label}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-muted"
      >
        <Icon className="h-5 w-5" />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-fg-soft transition-colors hover:bg-muted"
    >
      <Icon className="h-5 w-5 shrink-0" />
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
