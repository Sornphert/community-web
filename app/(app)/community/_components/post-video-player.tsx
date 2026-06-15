'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, Play } from 'lucide-react'

// Click-to-load Bunny video. Until the user clicks play we render only the
// poster image + a play overlay — NO iframe is mounted, so no Bunny stream or
// player request fires (bandwidth matters across a feed of cards). Shared by
// the feed card and post detail. Mirrors the classroom player's status states.
export function PostVideoPlayer({
  playerUrl,
  posterUrl,
  status,
}: {
  playerUrl: string
  posterUrl: string | null
  status: string | null
}) {
  const [playing, setPlaying] = useState(false)

  if (status === 'processing') {
    return (
      <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100">
        <p className="flex items-center gap-2 px-4 text-center text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Video is processing. Check back in a few minutes.
        </p>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100">
        <p className="flex items-center gap-2 px-4 text-center text-sm text-zinc-500">
          <AlertCircle className="h-4 w-4" />
          Video unavailable.
        </p>
      </div>
    )
  }

  if (status !== 'ready') {
    return null
  }

  return (
    <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-lg border border-zinc-200 bg-black">
      {playing ? (
        <iframe
          src={`${playerUrl}?autoplay=true`}
          style={{ border: 'none', width: '100%', height: '100%' }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            // The feed card wraps everything in a <Link>; stop the click from
            // navigating to the post AND from loading the stream prematurely.
            e.preventDefault()
            e.stopPropagation()
            setPlaying(true)
          }}
          aria-label="Play video"
          className="group absolute inset-0 h-full w-full"
        >
          {posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white transition-transform group-hover:scale-110">
              <Play className="h-7 w-7 translate-x-0.5 fill-current" />
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
