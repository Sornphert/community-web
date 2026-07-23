'use client'

import { useEffect, useState } from 'react'
import { ChevronsUp } from 'lucide-react'

// Labeled "Scroll to top" pill, centered at the bottom — appears once the page is
// scrolled a bit and smooth-scrolls up on click. Client-only; nothing until scrolled.
export function ScrollToTop() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    function onScroll() {
      setShow(window.scrollY > 600)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-inverse px-4 py-2 text-sm font-medium text-inverse-fg shadow-lg transition-colors hover:bg-inverse-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <ChevronsUp className="h-4 w-4" />
      Scroll to top
    </button>
  )
}
