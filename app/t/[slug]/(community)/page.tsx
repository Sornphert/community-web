import { getTeacherBySlug } from '@/lib/teachers'

// Teacher landing.
// STEP 1: render a minimal placeholder INSIDE the shell — the layout provides the
// sidebar/gate, this fills <main> — so an admitted member visibly lands in the teacher
// shell (makes "renders the shell" verifiable before Community exists).
// STEP 2: replace this body with redirect(`/t/${slug}/community/announcements`) once
// /t/[slug]/community is built (the redirect target must exist, or it 404s outside the
// shell). The teacher is guaranteed to exist + be a membership of the viewer here —
// the layout already resolved/gated it (getTeacherBySlug is cache()-deduped).
export default async function TeacherHome({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const teacher = await getTeacherBySlug(slug)

  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="text-xl font-semibold text-fg">{teacher?.name}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        You&rsquo;re in. Community, Classroom, Events and the rest arrive as each
        section is ported to this teacher shell (Step 2+).
      </p>
    </div>
  )
}
