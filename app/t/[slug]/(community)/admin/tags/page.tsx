import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getTeacherTags } from '@/lib/tags'
import { TagsManager } from './_components/tags-manager'

export default async function AdminTagsPage({
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

  // Defensive per-page admin guard (belt-and-suspenders alongside admin/layout.tsx;
  // mirrors the classroom admin pages). isTeacherAdmin is keyed to THIS teacher.
  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/community`)
  }

  const tags = await getTeacherTags(teacher.id)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Tags</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Tier tags gate classroom topics and mark members. Attach a tag to a topic
        (in Topic Covers) to require it, then assign the tag to members who should
        have access.
      </p>

      <TagsManager teacherId={teacher.id} tags={tags} />
    </div>
  )
}
