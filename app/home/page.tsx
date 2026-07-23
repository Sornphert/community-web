import Link from 'next/link'
import {
  getPublicFeed,
  getPublicFeedCategories,
  PUBLIC_FEED_PAGE_SIZE,
} from '@/lib/public-feed'
import { createClient } from '@/lib/supabase/server'
import {
  getAllTeachers,
  getMyMemberships,
  getTeacherMemberCounts,
} from '@/lib/teachers'
import type { DirectoryTeacher } from '@/lib/types'
import { CommunityCarousel } from './_components/community-carousel'
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
  const [feed, feedCategories] = await Promise.all([
    getPublicFeed(supabase, 0),
    getPublicFeedCategories(supabase),
  ])
  const feedSection =
    feed.length > 0 ? (
      <section className="mt-2">
        <h2 className="mb-2 text-base font-semibold text-fg-secondary">
          Latest from the communities
        </h2>
        <div className="mx-auto max-w-2xl">
          <PublicFeed
            initial={feed}
            initialHasMore={feed.length === PUBLIC_FEED_PAGE_SIZE}
            categories={feedCategories}
            loggedOut={!user}
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
        <section>
          <h2 className="mb-2 text-base font-semibold text-fg-secondary">
            Discover
          </h2>
          <CommunityCarousel>
            {teachers.map((teacher) => (
              <LockedCommunityCard
                key={teacher.id}
                teacher={teacher}
                memberCount={teacher.member_count}
                state="discover_public"
              />
            ))}
          </CommunityCarousel>
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
      {/* Only shown once the viewer actually belongs to a community — no empty-state
          "you're not a member yet" copy for a fresh signup. */}
      {myCommunities.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold text-fg-secondary">
            Your communities
          </h2>
          <CommunityCarousel>
            {myCommunities.map((teacher) => (
              <Link
                key={teacher.id}
                href={`/t/${teacher.slug}`}
                className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <TeacherCard
                  teacher={teacher}
                  memberCount={counts.get(teacher.id) ?? 0}
                  state="enter"
                  role={teacher.role}
                />
              </Link>
            ))}
          </CommunityCarousel>
        </section>
      )}

      {discover.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold text-fg-secondary">
            Discover
          </h2>
          <CommunityCarousel>
            {discover.map((teacher) => (
              <LockedCommunityCard
                key={teacher.id}
                teacher={teacher}
                memberCount={teacher.member_count}
                state="invite_only"
              />
            ))}
          </CommunityCarousel>
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
