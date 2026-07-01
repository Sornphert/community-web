import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileScreen } from './_components/profile-screen'

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

  return <ProfileScreen profile={profileData} email={user.email ?? ''} />
}
