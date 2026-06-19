import Link from 'next/link'
import { getAllTeachers, getMyMemberships } from '@/lib/teachers'
import { TeacherCard } from './_components/teacher-card'

// The multi-tenant shell: the post-login landing. Two sections —
//   • "Your communities": the teachers you actively belong to (memberships→teachers).
//   • "Discover": every other teacher in the open directory.
// Cards link to /t/<slug> (the per-teacher app shell — built separately).
export default async function HomePage() {
  const [myCommunities, allTeachers] = await Promise.all([
    getMyMemberships(),
    getAllTeachers(),
  ])

  const memberTeacherIds = new Set(myCommunities.map((t) => t.id))
  const discover = allTeachers.filter((t) => !memberTeacherIds.has(t.id))

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">Communities</h1>
      <p className="mb-8 text-sm text-fg-muted">
        Your communities, and others you can explore.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-fg-secondary">
          Your communities
        </h2>
        {myCommunities.length === 0 ? (
          <p className="text-sm text-fg-muted">
            You&rsquo;re not a member of any community yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {myCommunities.map((teacher) => (
              <Link key={teacher.id} href={`/t/${teacher.slug}`}>
                <TeacherCard
                  name={teacher.name}
                  slug={teacher.slug}
                  role={teacher.role}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      {discover.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg-secondary">
            Discover
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {discover.map((teacher) => (
              <Link key={teacher.id} href={`/t/${teacher.slug}`}>
                <TeacherCard name={teacher.name} slug={teacher.slug} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
