import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar userEmail={user.email ?? ''} />
      <main className="flex flex-1 flex-col bg-zinc-50 p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
    </div>
  )
}
