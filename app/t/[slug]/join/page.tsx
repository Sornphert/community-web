import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { getMyMembershipStatus, getTeacherBySlug } from '@/lib/teachers'
import { PLATFORM_LOGO_URL } from '@/lib/config'
import { RequestJoinButton } from './_components/request-join-button'

// Non-member join surface. Sits OUTSIDE the (community) route group, so it inherits auth +
// teacher resolution from the outer /t/[slug] layout but NOT the membership gate or member
// Sidebar — correct, a non-member must not see community nav. Because there's no shell, this
// page supplies its own minimal branded header (teacher logo + name). Four states:
//   active           → redirect into the teacher shell (a real page; no loop)
//   pending          → "waiting for approval", no button
//   none | revoked   → branded "Request to join {teacher}" CTA
export default async function JoinPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Defensive: the outer layout already resolved the teacher (cache()-deduped here).
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  const status = await getMyMembershipStatus(teacher.id)

  // Already in — send them into the community. /t/[slug] is a real landing page behind the
  // membership gate, so this cleanly forwards (no redirect loop).
  if (status === 'active') {
    redirect(`/t/${slug}`)
  }

  const isPending = status === 'pending'

  // A logo-less teacher falls back to the NEUTRAL platform logo — never BRAND_LOGO_URL
  // (that would leak teacher #1's brand into another teacher's page). Mirrors (community)/layout.
  const logoUrl = teacher.logo_url ?? PLATFORM_LOGO_URL

  return (
    <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <Image
            src={logoUrl}
            alt={teacher.name}
            width={88}
            height={88}
            unoptimized
            className="h-[88px] w-[88px] rounded-xl object-contain"
          />
          <h1 className="text-xl font-semibold leading-tight text-fg">
            {teacher.name}
          </h1>
        </div>

        {isPending ? (
          <div className="flex flex-col gap-2 text-center">
            <p className="text-sm font-medium text-fg">
              Your request is awaiting approval
            </p>
            <p className="text-sm text-fg-muted">
              An admin of {teacher.name} will review your request. You&rsquo;ll get
              access once it&rsquo;s approved.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {teacher.description && (
              <p className="text-center text-sm text-fg-muted">
                {teacher.description}
              </p>
            )}
            <RequestJoinButton
              slug={slug}
              teacherId={teacher.id}
              teacherName={teacher.name}
            />
          </div>
        )}
      </div>
    </div>
  )
}
