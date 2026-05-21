const MINUTE = 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

export function formatRelativeTime(date: string | Date): string {
  const then = date instanceof Date ? date : new Date(date)
  const ms = then.getTime()

  if (Number.isNaN(ms)) {
    return ''
  }

  const seconds = Math.floor((Date.now() - ms) / 1000)

  if (seconds < MINUTE) {
    return 'just now'
  }
  if (seconds < HOUR) {
    return `${Math.floor(seconds / MINUTE)}m ago`
  }
  if (seconds < DAY) {
    return `${Math.floor(seconds / HOUR)}h ago`
  }

  const days = Math.floor(seconds / DAY)
  if (days <= 30) {
    return `${days}d ago`
  }

  return then.toLocaleDateString()
}
