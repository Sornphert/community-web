import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { ProfileScreen } from '@/app/(app)/profile/_components/profile-screen'

// [MT] Profile EDIT + account settings, in-shell. The profile is GLOBAL (one
// profiles row per user, keyed on user.id) — teacher_id is NOT a factor; we resolve
// the slug only for shell consistency + the back link to the profile view.
export default async function TeacherProfileEditPage({
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
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href={`/t/${slug}/profile`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profile
      </Link>

      <ProfileScreen profile={profileData} email={user.email ?? ''} />
    </div>
  )
}
