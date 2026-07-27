import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { hasMembership, isTeacherAdmin } from '@/lib/auth'
import { getChannels } from '@/lib/posts'
import { getDmUnreadCount } from '@/lib/dm'
import { PLATFORM_LOGO_URL } from '@/lib/config'
import { Sidebar } from '@/app/(app)/_components/sidebar'

// The member-gated shell and the SINGLE tenancy seam. Resolution order:
//   slug → teacher (defensive 404) → ACTIVE-membership gate (else → /home)
//        → admin role for THIS teacher → scoped channels → teacher-scoped Sidebar.
// Everything under /t/[slug]/(community) renders inside this; pages re-resolve teacherId
// via the cache()-wrapped getTeacherBySlug (one DB hit/request, shared with the outer
// layout). Mirrors (app)/layout.tsx's auth posture; replaces its role for teacher-scoped
// routes. NOTE: the outer /t/[slug] layout owns auth + teacher resolution; this layer owns
// the membership gate and the member nav/shell so a non-member sibling (join) can exist
// outside this group.
export default async function TeacherCommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-suspenders alongside the proxy + outer /t/[slug] layout gate. redirect()
  // throws NEXT_REDIRECT — keep it outside any try/catch.
  if (!user) {
    redirect('/login')
  }

  // cache()-deduped with the outer layout's resolution. Defensive 404 if gone.
  const teacher = await getTeacherBySlug(slug)
  if (!teacher) {
    notFound()
  }

  // Membership gate: ACTIVE membership only — has_membership filters status='active',
  // so a revoked member is treated as a non-member and bounced. Non-members → /home.
  const isMember = await hasMembership(teacher.id)
  if (!isMember) {
    redirect('/home')
  }

  // Role + channels resolved for THIS teacher (never global, never stale). isTeacherAdmin
  // uses the same RPC as the RLS, so the UI cannot surface more than the DB permits.
  const isAdmin = await isTeacherAdmin(teacher.id)
  const channels = await getChannels(teacher.id)
  const dmUnread = await getDmUnreadCount(teacher.id)

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar
        slug={slug}
        teacherId={teacher.id}
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        channels={channels}
        dmUnread={dmUnread}
        brandName={teacher.name}
        // A logo-less teacher must NOT inherit the shared BRAND_LOGO_URL fallback
        // (teacher #1's /brand.jpg) — that would leak one teacher's logo into another's
        // shell. Fall back to the neutral PLATFORM logo here at the teacher-shell layer,
        // leaving the sidebar's single-tenant `?? BRAND_LOGO_URL` fallback intact for main.
        brandLogoUrl={teacher.logo_url ?? PLATFORM_LOGO_URL}
      />
      <main className="flex flex-1 flex-col bg-canvas p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
    </div>
  )
}
