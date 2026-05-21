import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'
import { ProfileForm } from './_components/profile-form'

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

      <ProfileForm profile={profileData} />

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
