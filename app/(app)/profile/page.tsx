import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { SHOW_THEME_TOGGLE } from '@/lib/config'
import { ProfileForm } from './_components/profile-form'
import { ThemeToggle } from '../_components/theme-toggle'
import { ChangePasswordButton } from './_components/change-password-button'
import { DeleteAccountButton } from './_components/delete-account-button'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const profileData = profile ?? {
    id: user.id,
    display_name: user.email ?? '',
    bio: '',
    avatar_url: null,
    social_links: {},
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Profile</h1>

      <ProfileForm profile={profileData} email={user.email ?? ''} />

      {SHOW_THEME_TOGGLE && (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Appearance</h2>
          <ThemeToggle />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-fg">Account</h2>
        <ChangePasswordButton email={user.email ?? ''} />
        <DeleteAccountButton />
      </div>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
