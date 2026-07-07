import { redirect } from 'next/navigation'

// Community is split into channels. Land on Announcements, scoped to this teacher.
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/t/${slug}/community/announcements`)
}
