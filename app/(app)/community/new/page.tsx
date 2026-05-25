import { redirect } from 'next/navigation'

// Legacy un-channeled new-post route. Default new posts to General.
export default function LegacyNewPostPage() {
  redirect('/community/general/new')
}
