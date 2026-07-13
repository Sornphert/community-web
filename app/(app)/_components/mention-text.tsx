import Link from 'next/link'
import { parseBody } from '@/lib/mentions'

// Renders a post/comment body, turning inline mention tokens into styled links.
// Pure render (no hooks) so it works in Server Components. Member mentions link
// to /members/[id]; @everyone renders as a non-link chip.
export function MentionText({
  body,
  className,
}: {
  body: string
  className?: string
}) {
  const segments = parseBody(body)

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <span key={i}>{seg.text}</span>
        }

        const label = seg.isAll ? '@everyone' : `@${seg.label}`
        const chip =
          'rounded bg-muted px-1 font-medium text-fg transition-colors'

        if (seg.isAll) {
          return (
            <span key={i} className={chip}>
              {label}
            </span>
          )
        }

        return (
          <Link
            key={i}
            href={`/members/${seg.id}`}
            className={`${chip} hover:bg-strong`}
          >
            {label}
          </Link>
        )
      })}
    </span>
  )
}
