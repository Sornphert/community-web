import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { BrandingForm } from './_components/branding-form'

// [MT] Per-teacher branding admin: set the cover (hero) + logo images and the
// directory description that the /home teacher cards render (step 3). Belt-and-
// suspenders guard alongside the shared admin layout (same posture as the topic
// covers page); isTeacherAdmin is keyed to THIS teacher.
export default async function AdminBrandingPage({
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

  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/community`)
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Branding</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Set the cover image, logo, and description shown on your community card in
        the directory.
      </p>

      <BrandingForm
        teacherId={teacher.id}
        coverUrl={teacher.cover_url}
        logoUrl={teacher.logo_url}
        description={teacher.description}
      />
    </div>
  )
}
