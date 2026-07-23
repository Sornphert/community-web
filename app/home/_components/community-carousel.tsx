'use client'

import {
  Children,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// Horizontal auto-scrolling carousel for the teacher directory. Behaviour:
//   • Drifts left on its own and LOOPS forever (the item list is rendered twice; the
//     transform wraps by one copy width, so the seam is invisible).
//   • Hold / drag to grab it — autoplay pauses while your finger (or mouse) is down.
//   • Flick left or right and it keeps moving that way with momentum, decaying back
//     to the gentle baseline drift.
//   • prefers-reduced-motion OR too-few-cards-to-overflow → falls back to a plain
//     natively-scrollable row (no autoplay), still swipeable.
//
// Implementation is transform-based (not scrollLeft) so autoplay + momentum + the
// seamless wrap share one number (xRef). A drag past the click threshold cancels the
// child click, so cards stay tappable but a swipe never fires a navigation/modal.

const AUTO_SPEED = 0.32 // px/frame baseline drift (~19px/s @60fps)
const FRICTION = 0.94 // momentum decay per frame
const CLICK_SLOP = 8 // px of movement that reclassifies a tap as a drag

export function CommunityCarousel({ children }: { children: ReactNode }) {
  const items = Children.toArray(children)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const xRef = useRef(0)
  const vRef = useRef(0)
  const copyWRef = useRef(0)
  const pressedRef = useRef(false) // finger/mouse down → PAUSE (even before a drag)
  const draggingRef = useRef(false) // moved past the slop → actually scrolling
  const movedRef = useRef(0)
  const lastXRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  // Start static; enable animation only after we measure real overflow. When the row
  // fits (e.g. desktop with a couple of cards) it STAYS static — no loop, no dupes.
  const [animated, setAnimated] = useState(false)

  // `animated` is a dependency so the observer recaptures the current copy count when
  // it flips (the track renders 1 copy static, 2 animated). Toggles both ways:
  // overflow → animate; viewport widened so it fits → back to static.
  useEffect(() => {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    function measure() {
      const viewport = viewportRef.current
      const track = trackRef.current
      if (!viewport || !track) return
      const copies = animated ? 2 : 1
      const singleW = track.scrollWidth / copies
      copyWRef.current = singleW
      setAnimated(!reduced && singleW > viewport.clientWidth + 1)
    }

    measure()
    const ro = new ResizeObserver(measure)
    const el = viewportRef.current
    if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [items.length, animated])

  useEffect(() => {
    if (!animated) return
    const track = trackRef.current
    if (!track) return

    function frame() {
      const copyW = copyWRef.current || 1
      // Pressed (holding) → frozen. While dragging, pointermove sets xRef directly,
      // so we also skip auto-movement here. Released → drift / decay momentum.
      if (!pressedRef.current) {
        if (Math.abs(vRef.current) > AUTO_SPEED) {
          // Momentum from a flick — glide, then decay toward baseline.
          xRef.current += vRef.current
          vRef.current *= FRICTION
        } else {
          // Baseline leftward drift.
          xRef.current -= AUTO_SPEED
        }
      }
      // Seamless wrap in either direction.
      if (xRef.current <= -copyW) xRef.current += copyW
      if (xRef.current > 0) xRef.current -= copyW
      if (track) {
        track.style.transform = `translate3d(${xRef.current}px,0,0)`
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      // Clear the imperatively-set transform + reset offset. React doesn't own this
      // inline style, so without this a leftover translate persists when we flip back
      // to the static layout (resize mobile→desktop) and shifts the row off-screen
      // ("cut in half"). The static branch renders one copy at translate 0.
      xRef.current = 0
      vRef.current = 0
      pressedRef.current = false
      draggingRef.current = false
      if (track) track.style.transform = ''
    }
  }, [animated])

  // --- pointer drag / flick ---
  // Press pauses immediately. We do NOT capture the pointer on down — capturing there
  // steals the tap so the card's own click (open modal / enter) never fires. Capture
  // only once movement passes the slop, i.e. a real drag, so a pure tap stays a click.
  function onPointerDown(e: React.PointerEvent) {
    if (!animated) return
    pressedRef.current = true
    draggingRef.current = false
    movedRef.current = 0
    lastXRef.current = e.clientX
    vRef.current = 0
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pressedRef.current) return
    const dx = e.clientX - lastXRef.current
    lastXRef.current = e.clientX
    movedRef.current += Math.abs(dx)

    if (!draggingRef.current && movedRef.current > CLICK_SLOP) {
      // Promote to a real drag now — capture so moves keep coming even off-element.
      draggingRef.current = true
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // capture unsupported/failed — dragging still works within the element
      }
    }
    if (draggingRef.current) {
      xRef.current += dx
      vRef.current = dx // last delta ≈ per-frame velocity for momentum
    }
  }

  function endDrag(e: React.PointerEvent) {
    if (!pressedRef.current) return
    pressedRef.current = false
    if (draggingRef.current) {
      draggingRef.current = false
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // pointer already released
      }
    }
  }

  // Swallow the click that follows a real drag, so a swipe never triggers a card.
  function onClickCapture(e: React.MouseEvent) {
    if (movedRef.current > CLICK_SLOP) {
      e.preventDefault()
      e.stopPropagation()
      movedRef.current = 0
    }
  }

  // Viewport-relative widths so a card is a consistent slice of the screen at every
  // size: ~80% on phones (one card leads, next peeks), ~46% small tablets, ~31%
  // desktop (~3 across). On desktop a short row that fits stays static (see measure()).
  const slideClass =
    'shrink-0 w-[60%] pr-6 sm:w-[44%] md:w-[30%] [&>*]:block [&>*]:w-full'

  // Static fallback (fits, or reduced-motion): a plain swipeable row, items rendered
  // ONCE — no loop, no duplicate. This is the "just show them, static" case.
  if (!animated) {
    return (
      <div
        ref={viewportRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Communities"
        // overflow-CLIP + clip-margin so a hover-enlarged card at the edge can spill
        // ~24px instead of being sliced. This branch is used when the row FITS (or
        // reduced-motion), so there's nothing to scroll — clip is safe and matches the
        // animated branch, keeping the fit/overflow measurement consistent.
        className="overflow-clip py-2 [overflow-clip-margin:1.5rem]"
      >
        <div ref={trackRef} className="flex">
          {items.map((child, i) => (
            <div key={`s-${i}`} className={slideClass}>
              {child}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Communities"
      // overflow-CLIP (not hidden) + a clip-margin lets a hover-enlarged card at the
      // row edge spill ~24px before clipping, so it isn't sliced — while the far-off
      // loop duplicates (hundreds of px away) are still clipped. Doesn't change
      // clientWidth, so the overflow/loop measurement is unaffected.
      className="overflow-clip py-2 [overflow-clip-margin:1.5rem] [touch-action:pan-y] select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      <div
        ref={trackRef}
        className="flex will-change-transform"
        style={{ cursor: 'grab' }}
      >
        {items.map((child, i) => (
          <div key={`a-${i}`} className={slideClass}>
            {child}
          </div>
        ))}
        {items.map((child, i) => (
          <div key={`b-${i}`} className={slideClass} aria-hidden>
            {child}
          </div>
        ))}
      </div>
    </div>
  )
}
