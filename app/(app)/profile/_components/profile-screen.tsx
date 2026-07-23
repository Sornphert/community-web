import Link from 'next/link'
import { ArrowLeft, ChevronRight, Users } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { SHOW_THEME_TOGGLE } from '@/lib/config'
import type { SocialLinks } from '@/lib/types'
import { ProfileForm } from './profile-form'
import { ThemeToggle } from '../../_components/theme-toggle'
import { ChangePasswordButton } from './change-password-button'
import { DeleteAccountButton } from './delete-account-button'

// Presentational profile screen shared by the global /profile route and the
// in-shell /t/[slug]/profile route. Profile is GLOBAL (one profiles row per user),
// so both pages fetch the same row (keyed on user.id) and render this. Data
// fetching stays in the pages; this component is purely presentational.
type ProfileScreenProps = {
  profile: {
    id: string
    display_name: string
    bio: string | null
    avatar_url: string | null
    social_links: SocialLinks
  }
  email: string
}

export function ProfileScreen({ profile, email }: ProfileScreenProps) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Edit profile</h1>

      <ProfileForm profile={profile} email={email} />

      <Link
        href="/following"
        className="mt-6 flex items-center justify-between rounded-lg border border-line bg-surface p-4 transition-colors hover:bg-hover-subtle"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          <Users className="h-4 w-4 shrink-0 text-fg-muted" />
          Following feed
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
      </Link>

      {SHOW_THEME_TOGGLE && (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Appearance</h2>
          <ThemeToggle />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-fg">Account</h2>
        <ChangePasswordButton email={email} />
        <DeleteAccountButton />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/home"
          className="flex items-center gap-2 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Communities
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
