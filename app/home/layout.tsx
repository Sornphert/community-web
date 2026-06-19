import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// The multi-tenant shell home lives OUTSIDE the (app) route group on purpose:
// (app)/layout renders the single-tenant Sidebar + getChannels() and reads
// profiles.is_admin — none of which apply to a teacher picker (and is_admin no
// longer exists in the MT schema). This layout only gates auth and provides a
// plain canvas. proxy.ts already redirects unauthenticated users to /login; the
// getUser() check here is belt-and-suspenders, mirroring (app)/layout.tsx.
export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // redirect() throws NEXT_REDIRECT — keep it outside any try/catch.
  if (!user) {
    redirect('/login')
  }

  return (
    <main className="flex flex-1 flex-col bg-canvas p-4 pb-20 md:p-6 md:pb-6">
      {children}
    </main>
  )
}
