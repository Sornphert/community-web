import type { CommunityEvent } from '@/lib/types'

// Builds an RFC 5545 VCALENDAR string for a single event so members can add it
// to their own calendar. DTSTART/DTEND are emitted in UTC (...Z); a UID and
// DTSTAMP are mandatory — Google Calendar silently rejects files missing them.

const DOMAIN = 'app.theprophetsystem.com'

// 'YYYYMMDDTHHMMSSZ' — UTC basic format.
function toUtcStamp(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

// Escape text per RFC 5545: backslash, semicolon, comma, and newlines.
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function buildIcs(event: CommunityEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Prophet System//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@${DOMAIN}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(event.starts_at)}`,
    `DTEND:${toUtcStamp(event.ends_at)}`,
    `SUMMARY:${esc(event.title)}`,
  ]

  if (event.location) {
    lines.push(`LOCATION:${esc(event.location)}`)
  }

  // Fold the meeting URL into the description (and a URL property) so it travels
  // with the event regardless of how the calendar app surfaces fields.
  const descriptionParts: string[] = []
  if (event.description) descriptionParts.push(event.description)
  if (event.meeting_url) descriptionParts.push(`Join: ${event.meeting_url}`)
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${esc(descriptionParts.join('\n\n'))}`)
  }
  if (event.meeting_url) {
    lines.push(`URL:${esc(event.meeting_url)}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  // RFC 5545 requires CRLF line endings.
  return lines.join('\r\n')
}

// Safe-ish file name from the event title.
export function icsFileName(event: CommunityEvent): string {
  const slug = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'event'}.ics`
}
