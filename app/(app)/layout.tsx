import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getChannels } from '@/lib/posts'
import { Sidebar } from './_components/sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-suspenders alongside the proxy gate. redirect() throws
  // NEXT_REDIRECT — keep it outside any try/catch.
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.is_admin === true

  const channels = await getChannels()

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        channels={channels}
      />
      <main className="flex flex-1 flex-col bg-canvas p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
    </div>
  )
}
