import Link from 'next/link'
import { parseBody } from '@/lib/mentions'

// Split a plain-text run into text + clickable http(s) links. Trailing punctuation
// is kept out of the href so "see https://x.com." doesn't capture the period.
const URL_RE = /(https?:\/\/[^\s]+)/g

function linkify(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    let url = m[0]
    let trailing = ''
    const punct = /[.,!?;:)\]]+$/.exec(url)
    if (punct) {
      trailing = punct[0]
      url = url.slice(0, -trailing.length)
    }
    out.push(
      <a
        key={`${m.index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2 hover:opacity-80"
      >
        {url}
      </a>,
    )
    if (trailing) out.push(trailing)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Renders a post/comment body, turning inline mention tokens into styled links.
// Pure render (no hooks) so it works in Server Components. `slug` builds the
// per-teacher member link; when absent, mentions render as non-link chips.
export function MentionText({
  body,
  slug,
  className,
}: {
  body: string
  slug?: string
  className?: string
}) {
  const segments = parseBody(body)

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <span key={i}>{linkify(seg.text)}</span>
        }

        const label = seg.isAll ? '@everyone' : `@${seg.label}`
        const chip =
          'rounded bg-muted px-1 font-medium text-fg transition-colors'

        if (seg.isAll || !slug) {
          return (
            <span key={i} className={chip}>
              {label}
            </span>
          )
        }

        return (
          <Link
            key={i}
            href={`/t/${slug}/members/${seg.id}`}
            className={`${chip} hover:bg-strong`}
          >
            {label}
          </Link>
        )
      })}
    </span>
  )
}
