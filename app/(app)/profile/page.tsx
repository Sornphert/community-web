import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { ProfileForm } from './_components/profile-form'
import { ChangePasswordButton } from './_components/change-password-button'

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
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">Profile</h1>

      <ProfileForm profile={profileData} email={user.email ?? ''} />

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Account</h2>
        <ChangePasswordButton email={user.email ?? ''} />
      </div>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
