import { notFound } from 'next/navigation'
import { getTeacherBySlug } from '@/lib/teachers'
import { getAllMembers } from '@/lib/posts'
import { MembersDirectory } from './_components/members-directory'

// [MT] Member-visible directory: any active member of this teacher (membership is
// gated by the /t/[slug] layout) sees the roster. No page-level admin guard — the
// per-member "Admin" badge reads each listed member's role in THIS teacher.
export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  const members = await getAllMembers(teacher.id)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Members</h1>

      {members.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No members yet</p>
        </div>
      ) : (
        <MembersDirectory
          slug={slug}
          members={members.map((m) => ({
            id: m.id,
            display_name: m.display_name,
            avatar_url: m.avatar_url,
            bio: m.bio,
            role: m.role,
          }))}
        />
      )}
    </div>
  )
}
