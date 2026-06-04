import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Single-place admin guard for every /admin/* route (current and future). Mirrors the
// per-page guard used across the app; the per-page guards stay in place too (belt and
// suspenders). RLS remains the data-layer authority.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/community')

  return <>{children}</>
}
