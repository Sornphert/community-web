import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { getTeacherByJoinToken, getMyMembershipStatus } from '@/lib/teachers'
import { PLATFORM_LOGO_URL } from '@/lib/config'
import { RequestJoinButton } from '@/app/t/[slug]/join/_components/request-join-button'

// Non-guessable invite link (0030): /join/{token}. Resolves the community from the
// token (unreadable to clients; SECURITY DEFINER RPC), then runs the same request-
// access flow. An invalid/expired token 404s. Anon visitors are bounced to /login
// with ?returnTo by the proxy, then land back here.
//   active           → into the community shell
//   pending          → "awaiting approval"
//   none | revoked   → "Request to join" (the action re-verifies the token)
export default async function InviteJoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const teacher = await getTeacherByJoinToken(token)
  if (!teacher) {
    notFound()
  }

  const status = await getMyMembershipStatus(teacher.id)
  if (status === 'active') {
    redirect(`/t/${teacher.slug}`)
  }
  const isPending = status === 'pending'
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
              {`An admin of ${teacher.name} will review your request. You'll get access once it's approved.`}
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
              slug={teacher.slug}
              teacherId={teacher.id}
              teacherName={teacher.name}
              token={token}
            />
          </div>
        )}
      </div>
    </div>
  )
}
