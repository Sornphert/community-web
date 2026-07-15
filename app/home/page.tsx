import Link from 'next/link'
import { getPublicFeed, PUBLIC_FEED_PAGE_SIZE } from '@/lib/public-feed'
import { createClient } from '@/lib/supabase/server'
import {
  getAllTeachers,
  getMyMemberships,
  getTeacherMemberCounts,
} from '@/lib/teachers'
import type { DirectoryTeacher } from '@/lib/types'
import { LockedCommunityCard } from './_components/locked-community-card'
import { PublicFeed } from './_components/public-feed'
import { TeacherCard } from './_components/teacher-card'

// The public teacher directory. Branches on auth:
//   • Logged-out → "Discover" only (every teacher, branded cards + counts), NO Enter,
//     NO join action. Membership is granted manually, so there is no self-serve path.
//   • Logged-in  → "Your communities" (joined → Enter, clickable) above "Discover"
//     (non-joined → disabled "Invite only").
// Counts come from the teacher_member_counts() RPC ONLY (never a memberships SELECT).
export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // [Surface 4] Global public feed, shown to BOTH audiences below the directory.
  // Page 0 is rendered server-side; <PublicFeed> pages the rest via "Load more".
  // getPublicFeed never throws, so a feed hiccup can't break the directory. The
  // section is omitted entirely when the corpus is empty (no sad empty heading).
  const feed = await getPublicFeed(supabase, 0)
  const feedSection =
    feed.length > 0 ? (
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-fg-secondary">
          Latest from the communities
        </h2>
        <div className="mx-auto max-w-2xl">
          <PublicFeed
            initial={feed}
            initialHasMore={feed.length === PUBLIC_FEED_PAGE_SIZE}
          />
        </div>
      </section>
    ) : null

  // ---- Logged-out: Discover-only, no getUser-required calls, no '*' select ----
  if (!user) {
    const [allTeachers, counts] = await Promise.all([
      getAllTeachers(),
      getTeacherMemberCounts(),
    ])
    const teachers = withCounts(allTeachers, counts)

    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-1 text-xl font-semibold text-fg">Communities</h1>
        <p className="mb-8 text-sm text-fg-muted">
          Browse the communities on the platform.
        </p>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-fg-secondary">
            Discover
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher) => (
              <LockedCommunityCard
                key={teacher.id}
                teacher={teacher}
                memberCount={teacher.member_count}
                state="discover_public"
              />
            ))}
          </div>
        </section>

        {feedSection}
      </div>
    )
  }

  // ---- Logged-in: Your communities (Enter) + Discover (Invite only) ----
  const [myCommunities, allTeachers, counts] = await Promise.all([
    getMyMemberships(),
    getAllTeachers(),
    getTeacherMemberCounts(),
  ])

  const memberTeacherIds = new Set(myCommunities.map((t) => t.id))
  const discover = withCounts(
    allTeachers.filter((t) => !memberTeacherIds.has(t.id)),
    counts,
  )

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
                  teacher={teacher}
                  memberCount={counts.get(teacher.id) ?? 0}
                  state="enter"
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
              <LockedCommunityCard
                key={teacher.id}
                teacher={teacher}
                memberCount={teacher.member_count}
                state="invite_only"
              />
            ))}
          </div>
        </section>
      )}

      {feedSection}
    </div>
  )
}

// Overlay the RPC-sourced counts onto the directory rows (missing → 0).
function withCounts(
  teachers: DirectoryTeacher[],
  counts: Map<string, number>,
): DirectoryTeacher[] {
  return teachers.map((t) => ({ ...t, member_count: counts.get(t.id) ?? 0 }))
}
