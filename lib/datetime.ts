// Timezone helpers for the Events calendar.
//
// Events are stored as UTC timestamptz and displayed in the configured TIMEZONE
// (default Asia/Kuala_Lumpur). That zone is a fixed offset (no DST), which makes
// the wall-clock <-> UTC conversions exact. These helpers must be used for *day
// bucketing* on the calendar — never bucket by the UTC date or the browser-local
// date, or events near the local midnight boundary land in the wrong cell.
//
// Export names are kept as KL_* for compatibility with existing importers; the
// values now come from lib/config.ts so they follow the deployment's timezone.

import { TIMEZONE, TIMEZONE_OFFSET, TIMEZONE_LABEL } from '@/lib/config'

export const KL_TZ = TIMEZONE
export const KL_TZ_LABEL = TIMEZONE_LABEL

const MS_PER_DAY = 86_400_000

// 'YYYY-MM-DD' calendar date of an instant, evaluated in KL time. en-CA renders
// the parts in ISO order, so this is a stable, comparable day key.
export function klDayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// '9:00 AM' — KL time of day.
export function formatKlTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-US', {
    timeZone: KL_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

// 'Thursday, June 4, 2026' — KL date.
export function formatKlDateLong(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return new Intl.DateTimeFormat('en-US', {
    timeZone: KL_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

// Parts for a compact date badge: { day: '4', month: 'Jun' } in KL time.
export function klDateBadge(iso: string | Date): { day: string; month: string } {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: KL_TZ,
    day: 'numeric',
  }).format(d)
  const month = new Intl.DateTimeFormat('en-US', {
    timeZone: KL_TZ,
    month: 'short',
  }).format(d)
  return { day, month }
}

// 'HH:MM' (24h) value for an <input type="time">, expressed in KL time. Used to
// pre-fill the composer when editing an event stored as UTC.
export function klTimeInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

// Converts a wall-clock date + time (from the composer's <input>s) to a UTC ISO
// string for storage. The configured zone has no DST, so the fixed
// TIMEZONE_OFFSET is exact. Returns null if the inputs don't form a valid date.
export function klWallClockToUtcIso(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00${TIMEZONE_OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type MonthCell = {
  dateKey: string // 'YYYY-MM-DD'
  day: number
  inMonth: boolean
}

// A 6-row (42-cell) Sun–Sat grid for the given year/month (month is 0-based).
// Built with UTC date arithmetic so it's a pure calendar computation, free of
// timezone/DST drift; cells are compared against event day keys from klDayKey().
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstOfMonth = Date.UTC(year, month, 1)
  const firstWeekday = new Date(firstOfMonth).getUTCDay() // 0 = Sunday
  const start = firstOfMonth - firstWeekday * MS_PER_DAY

  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start + i * MS_PER_DAY)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const day = d.getUTCDate()
    const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({ dateKey, day, inMonth: m === month })
  }
  return cells
}

// 'June 2026' label for a year/month (0-based). Constructed in UTC and read back
// in UTC so the month never slips across a timezone boundary.
export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month, 1)))
}

// Adds whole calendar days to a 'YYYY-MM-DD' key and returns a new key. Uses
// Date.UTC normalization so month/year rollover is handled. This is pure date
// arithmetic — used to step a KL calendar date across a multi-day series before
// each day is converted back to UTC (NOT a 24h-in-UTC shift).
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// 'Jun 14' label for a 'YYYY-MM-DD' key. Read back in UTC so the day never
// slips. Used for the composer's series preview line.
export function formatDateKeyShort(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

// Today's KL calendar date as { year, month (0-based), dateKey }.
export function klToday(): { year: number; month: number; dateKey: string } {
  const dateKey = klDayKey(new Date())
  const [year, month] = dateKey.split('-').map(Number)
  return { year, month: month - 1, dateKey }
}
