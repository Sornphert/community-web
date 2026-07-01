import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { ProfileScreen } from '@/app/(app)/profile/_components/profile-screen'

// [MT] Profile as an in-shell tab. The profile is GLOBAL (one profiles row per
// user, keyed on user.id) — teacher_id is NOT a factor here. We resolve the slug
// only for shell consistency (404 on an unknown teacher); the profile fetch is
// identical to the global /profile route. Renders inside the teacher shell so the
// sidebar/tabs stay visible instead of ejecting the user to /profile.
export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

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
    <ProfileScreen profile={profileData} email={user.email ?? ''} />
  )
}
