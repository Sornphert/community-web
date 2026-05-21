const PARAMS = 'title=0&byline=0&portrait=0'

/**
 * Parse a Vimeo URL into an embeddable player URL.
 *
 * Handles:
 * - https://vimeo.com/123456789           → player.vimeo.com/video/123456789
 * - https://vimeo.com/123456789/abc123    → player.vimeo.com/video/123456789?h=abc123
 * - https://www.vimeo.com/...             → www prefix tolerated
 * - https://player.vimeo.com/video/...    → passed through (existing query kept)
 * - anything else                         → null
 *
 * The branding-minimizing params (title/byline/portrait) are always present,
 * joined with `?` or `&` depending on whether the URL already has a query.
 */
export function parseVimeoUrl(url: string): { embedUrl: string } | null {
  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }

  // Already a player embed URL — pass through, preserving any existing query.
  const playerMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?player\.vimeo\.com\/video\/(\d+)(\?[^\s]*)?$/i,
  )
  if (playerMatch) {
    const [, id, query] = playerMatch
    const base = `https://player.vimeo.com/video/${id}`
    const separator = query && query.length > 1 ? '&' : '?'
    return { embedUrl: `${base}${query ?? ''}${separator}${PARAMS}` }
  }

  // Standard vimeo.com/{id} or vimeo.com/{id}/{hash}
  const standardMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/([A-Za-z0-9]+))?\/?$/i,
  )
  if (standardMatch) {
    const [, id, hash] = standardMatch
    const base = `https://player.vimeo.com/video/${id}`
    if (hash) {
      return { embedUrl: `${base}?h=${hash}&${PARAMS}` }
    }
    return { embedUrl: `${base}?${PARAMS}` }
  }

  return null
}
