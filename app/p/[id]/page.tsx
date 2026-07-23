import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherBySlug } from '@/lib/teachers'
import { hasMembership } from '@/lib/auth'
import { getPublicPost } from '@/lib/public-post'
import { bodyToPlainText } from '@/lib/mentions'
import { PublicPostView } from './_components/public-post-view'

// Share preview for a public post link.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const post = await getPublicPost(supabase, id)
  if (!post) return {}

  const title = post.title ?? `${post.display_name} on ${post.teacher_name}`
  const description = bodyToPlainText(post.body).slice(0, 160)
  const image = post.image_url ?? undefined
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

// Public post detail. Three audiences:
//   • MEMBER of the post's teacher → redirect to the REAL in-app post (full comments
//     + commenting). Nothing is duplicated here.
//   • logged-in NON-member → full post, comments shown as a members-only join prompt.
//   • anon → teaser (faded text, blurred image) + sign-up wall.
// The post itself is only ever a PUBLIC one (public_post re-checks); comment TEXT
// never reaches this route.
export default async function PublicPostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const post = await getPublicPost(supabase, id)
  if (!post) {
    notFound()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const teacher = await getTeacherBySlug(post.teacher_slug)
    if (teacher && (await hasMembership(teacher.id))) {
      // Member → the real gated post (or the community if the post has no channel).
      redirect(
        post.channel_slug
          ? `/t/${post.teacher_slug}/community/${post.channel_slug}/${post.post_id}`
          : `/t/${post.teacher_slug}/community`,
      )
    }
    // Logged-in, not a member.
    return <PublicPostView post={post} mode="member-gate" />
  }

  // Anon.
  return <PublicPostView post={post} mode="teaser" />
}
