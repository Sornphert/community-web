import type { SocialPlatform, SocialLinks } from '@/lib/types'

// Single source of truth for social platforms: form metadata, save-time
// normalization, and render-time URL construction. Pure (no React) so it can be
// imported by both the client profile form and the server-rendered member page.

export const SOCIAL_PLATFORMS: {
  id: SocialPlatform
  label: string
  placeholder: string
}[] = [
  { id: 'instagram', label: 'Instagram', placeholder: '@handle or username' },
  { id: 'facebook', label: 'Facebook', placeholder: '@handle or username' },
  { id: 'tiktok', label: 'TikTok', placeholder: '@handle or username' },
  { id: 'youtube', label: 'YouTube', placeholder: '@handle or username' },
  { id: 'telegram', label: 'Telegram', placeholder: '@handle or username' },
  { id: 'website', label: 'Website', placeholder: 'https://example.com' },
]

// Pull the last meaningful path segment out of a pasted profile URL, e.g.
// "https://instagram.com/johndoe/?hl=en" -> "johndoe". Returns the trimmed
// input unchanged if it doesn't look like a URL.
function handleFromMaybeUrl(value: string): string {
  const looksLikeUrl = /^https?:\/\//i.test(value) || value.includes('/')
  if (!looksLikeUrl) {
    return value
  }
  const withoutQuery = value.split(/[?#]/)[0]
  const segments = withoutQuery
    .replace(/^https?:\/\//i, '')
    .split('/')
    .filter(Boolean)
  // Drop the host (first segment) when a scheme/host was present; otherwise use
  // the last non-empty segment.
  const candidate = segments[segments.length - 1] ?? value
  return candidate.replace(/^@/, '')
}

// Runs on save. Trims, strips a leading "@", and extracts the handle from a
// pasted URL. Empty after trim => key omitted (clears that link). Website keeps
// its full URL and gets an https:// scheme prepended if missing. Validation is
// intentionally light — odd-but-plausible handles are kept.
export function normalizeSocialLinks(
  raw: Record<string, string>,
): SocialLinks {
  const result: SocialLinks = {}

  for (const { id } of SOCIAL_PLATFORMS) {
    const value = (raw[id] ?? '').trim()
    if (!value) {
      continue
    }

    if (id === 'website') {
      result.website = /^https?:\/\//i.test(value) ? value : `https://${value}`
      continue
    }

    const handle = handleFromMaybeUrl(value.replace(/^@/, '')).trim()
    if (handle) {
      result[id] = handle
    }
  }

  return result
}

// Runs on render. Builds the canonical URL for a stored handle. For `website`,
// only returns the stored value if it has an http(s) scheme — client-side
// normalization is bypassable and the value is used as a raw href, so this
// guards against a `javascript:` (or other-scheme) XSS vector. Returns null
// when there is nothing safe/sensible to link to; callers skip null.
export function socialUrl(
  platform: SocialPlatform,
  handle: string,
): string | null {
  const h = handle.trim().replace(/^@/, '')
  if (!h && platform !== 'website') {
    return null
  }

  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${h}`
    case 'facebook':
      return `https://facebook.com/${h}`
    case 'tiktok':
      return `https://tiktok.com/@${h}`
    case 'youtube':
      return `https://youtube.com/@${h}`
    case 'telegram':
      return `https://t.me/${h}`
    case 'website':
      return /^https?:\/\//i.test(handle.trim()) ? handle.trim() : null
  }
}
