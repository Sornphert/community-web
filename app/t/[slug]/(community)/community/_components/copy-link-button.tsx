'use client'

import { Link2 } from 'lucide-react'
import { useToast } from '@/app/_components/toast'

// Copies the current post's URL to the clipboard and confirms with a toast. Used on
// the post detail so members can share a link to a post within the community.
export function CopyLinkButton() {
  const { showToast } = useToast()

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('Link copied', 'success')
    } catch {
      showToast('Could not copy link', 'error')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-fg-muted transition-colors hover:text-fg"
      aria-label="Copy link to this post"
    >
      <Link2 className="h-4 w-4" />
      Copy link
    </button>
  )
}
