import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PLATFORM_NAME, PLATFORM_LOGO_URL } from '@/lib/config'

// [MT] Global, teacher-AGNOSTIC shell. After the multi-tenant port the only route
// left under (app) is the global /profile (every teacher-scoped vertical lives under
// /t/[slug] with its own shell + per-teacher Sidebar). There is no teacher context
// here, so we render minimal chrome — brand + back-to-/home — and NO teacher Sidebar.
// Deliberately reads neither is_admin (gone under MT) nor channels (per-teacher); the
// teacher nav belongs to /t/[slug]/layout.tsx.
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
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas px-4 py-3">
        <div className="flex items-center gap-2">
          <Image
            src={PLATFORM_LOGO_URL}
            alt={PLATFORM_NAME}
            width={28}
            height={28}
            className="h-7 w-7 rounded object-contain shrink-0"
          />
          <span className="hidden text-sm font-semibold text-fg sm:inline">
            {PLATFORM_NAME}
          </span>
        </div>
      </header>
      <main className="flex flex-1 flex-col bg-canvas p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
    </div>
  )
}
