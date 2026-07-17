import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          )
        },
      },
    },
  )

  // IMPORTANT: refresh the session before any gating logic. Do not run code
  // between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Build a redirect response that carries over any cookies the session refresh
  // wrote to supabaseResponse — dropping them would desync the browser/server
  // session and cause premature logouts.
  const redirectPreservingCookies = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  const { pathname } = request.nextUrl

  // Routes reachable without a session: login plus the password-reset flow
  // (the reset page itself and the email-link confirm handler that establishes
  // the recovery session).
  const PUBLIC_PATHS = [
    '/login',
    '/reset-password',
    '/auth/confirm',
    '/forgot-password',
  ]

  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    return redirectPreservingCookies('/login')
  }

  if (user && pathname === '/login') {
    return redirectPreservingCookies('/community')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/bunny/webhook (external Bunny Stream webhook; self-auths via ?secret=)
     * - api/push/send (Supabase notifications webhook; self-auths via ?secret=)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt, manifest.webmanifest (metadata files)
     * - common image extensions
     *
     * manifest.webmanifest MUST stay public: the browser fetches it (often
     * without the session cookie) when installing the PWA / adding to the Home
     * Screen. If the gate redirects it to /login, Chrome gets HTML instead of the
     * icon list and falls back to a generated letter icon on Android.
     */
    '/((?!api/bunny/webhook|api/push/send|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
