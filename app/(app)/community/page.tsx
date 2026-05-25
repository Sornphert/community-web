import { redirect } from 'next/navigation'

// Community is now split into channels. Land on Announcements.
export default function CommunityPage() {
  redirect('/community/announcements')
}
