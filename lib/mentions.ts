// Mention tokens are stored INLINE in a post/comment body so the DB triggers
// (0015_notifications.sql) can parse recipients out of the text with no extra
// table. The picker inserts these tokens; the renderer (MentionText) turns them
// back into links; the DB regex keys off the `](<uuid>)` / `](all)` tail.
//
//   individual : @[Display Name](<uuid>)
//   everyone   : @[everyone](all)
//
// Keep this format in lockstep with the regex in _extract_mention_ids() and the
// `like '%](all)%'` check in the SQL migration.

// Sentinel used in the token's link slot for an @all mention.
export const MENTION_ALL_SENTINEL = 'all'

// Serialize a single member mention into its inline token.
export function mentionToken(id: string, displayName: string): string {
  return `@[${displayName}](${id})`
}

// Serialize the @all token (admin-only in effect — the DB enforces it).
export function mentionAllToken(): string {
  return `@[everyone](${MENTION_ALL_SENTINEL})`
}

// A parsed segment of a body: either plain text or a resolved mention.
export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; id: string; label: string; isAll: boolean }

// Matches both `@[Name](uuid)` and `@[everyone](all)`. The label may contain any
// character except a literal `]` (display names are simple in practice).
const TOKEN_RE =
  /@\[([^\]]+)\]\((all|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g

// Split a body into text + mention segments for rendering.
export function parseBody(body: string): BodySegment[] {
  const segments: BodySegment[] = []
  let lastIndex = 0
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: body.slice(lastIndex, match.index) })
    }
    const [, label, target] = match
    const isAll = target === MENTION_ALL_SENTINEL
    segments.push({ kind: 'mention', id: target, label, isAll })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < body.length) {
    segments.push({ kind: 'text', text: body.slice(lastIndex) })
  }
  return segments
}

// Strip mention tokens down to their `@label` for previews / plain contexts
// (e.g. the feed card snippet, notification text).
export function bodyToPlainText(body: string): string {
  return parseBody(body)
    .map((seg) => (seg.kind === 'text' ? seg.text : `@${seg.label}`))
    .join('')
}
