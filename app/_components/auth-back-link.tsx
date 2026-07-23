import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Shared top-left back link for the auth cards (login / forgot-password /
// reset-password) so all three look identical. Dark text for the white card.
export function AuthBackLink({
  href,
  label = 'Back',
}: {
  href: string
  label?: string
}) {
  return (
    <Link
      href={href}
      className="mb-4 -ml-1 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  )
}
