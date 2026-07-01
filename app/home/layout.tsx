import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { APP_NAME, BRAND_LOGO_URL } from '@/lib/config'
import { Avatar } from '@/app/(app)/_components/avatar'

// The multi-tenant directory shell. PUBLIC: this layout no longer gates auth — anon
// visitors see the directory too (proxy.ts allows '/' and '/home' without a session).
// It still calls getUser() ONLY to choose the header: an Account avatar → /profile when
// authed, or Log in / Sign up links when anon. getUser() returns null for anon without
// throwing, so the logged-out path is safe. The page itself branches on auth for content.
export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Authed-only: read the profile for the header avatar (anon path skips this — no
  // getUser-required query runs for logged-out viewers).
  let displayName = ''
  let avatarUrl: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
    displayName = profile?.display_name ?? user.email ?? ''
    avatarUrl = profile?.avatar_url ?? null
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas px-4 py-3">
        <Link href="/home" className="flex items-center gap-2">
          <Image
            src={BRAND_LOGO_URL}
            alt={APP_NAME}
            width={28}
            height={28}
            className="rounded shrink-0"
          />
          <span className="hidden text-sm font-semibold text-fg sm:inline">
            {APP_NAME}
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
              aria-label="Account"
            >
              <Avatar url={avatarUrl} name={displayName} size="sm" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-muted"
              >
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                className="rounded-md bg-inverse px-3 py-1.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-hover"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col bg-canvas p-4 pb-20 md:p-6 md:pb-6">
        {children}
      </main>
    </div>
  )
}
