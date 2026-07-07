import { redirect } from 'next/navigation'

// Legacy un-channeled new-post route. Default new posts to General, scoped to
// this teacher.
export default async function LegacyNewPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/t/${slug}/community/general/new`)
}
