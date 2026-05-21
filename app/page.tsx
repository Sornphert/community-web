import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// `/` is a router, not a real page: send users to the right place.
export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // redirect() throws NEXT_REDIRECT — keep these outside any try/catch.
  if (!user) {
    redirect('/login')
  }

  redirect('/community')
}
