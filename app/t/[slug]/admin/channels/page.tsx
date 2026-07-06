import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { isTeacherAdmin } from '@/lib/auth'
import { getChannels, getChannelPostCounts } from '@/lib/posts'
import { ChannelsManager } from './_components/channels-manager'

export default async function AdminChannelsPage({
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
  // mirrors the classroom/tags admin pages). isTeacherAdmin is keyed to THIS teacher.
  if (!(await isTeacherAdmin(teacher.id))) {
    redirect(`/t/${slug}/community`)
  }

  // Both reads are section='community' scoped. getChannels drives the ordered list;
  // postCounts is delete-UX only (the DB FK is the real delete guard).
  const [channels, postCounts] = await Promise.all([
    getChannels(teacher.id),
    getChannelPostCounts(teacher.id),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Channels</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Create, rename, reorder, and delete your community channels. “Admins only”
        channels let only admins post; everyone can still read them. A channel’s URL is
        fixed when it’s created and doesn’t change when you rename it.
      </p>

      <ChannelsManager
        teacherId={teacher.id}
        channels={channels}
        postCounts={postCounts}
      />
    </div>
  )
}
