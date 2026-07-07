import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar } from '@/app/(app)/_components/avatar'
import { getTeacherBySlug } from '@/lib/teachers'
import { getAllMembers } from '@/lib/posts'

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
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/t/${slug}/members/${member.id}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-hover-subtle"
            >
              <Avatar
                url={member.avatar_url}
                name={member.display_name}
                size="md"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">
                    {member.display_name}
                  </span>
                  {member.role === 'admin' && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
                      Admin
                    </span>
                  )}
                </div>
                {member.bio && (
                  <p className="truncate text-sm text-fg-muted">{member.bio}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
