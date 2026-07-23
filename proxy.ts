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

  // Anon bounce to /login, stamping the originally-requested path as ?returnTo so the login
  // action can send the user back after auth (the login handler VALIDATES it — open-redirect
  // guard — and defaults to /home). ADDITIVE: only the anon-bounce path gains the param; the
  // authenticated → /home branch below is unchanged, and a DIRECT /login visit (never bounced)
  // gets no param — byte-identical to today, so single-tenant `main`'s default path is unchanged.
  const redirectToLogin = () => {
    const url = request.nextUrl.clone()
    const returnTo = pathname + request.nextUrl.search
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('returnTo', returnTo)
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  // Routes reachable without a session: the public teacher directory ('/' router
  // + '/home'), login, and the password-reset flow (the reset page itself and the
  // email-link confirm handler that establishes the recovery session).
  //
  // EXACT-EQUALITY membership (PUBLIC_PATHS.includes(pathname)) below — NOT a prefix
  // match. So only these literal paths are anon-reachable; every /t/[slug] and (app)
  // route stays gated (anon hitting any of them still redirects to /login, and each
  // of those route groups re-checks auth in its own layout).
  const PUBLIC_PATHS = [
    '/',
    '/home',
    '/about',
    '/privacy',
    '/login',
    '/reset-password',
    '/auth/confirm',
    '/forgot-password',
  ]

  // Public author profiles (/u/[teacher]/[id], 0017) and public post detail
  // (/p/[id], 0023) are DYNAMIC prefixes, so they can't sit in the exact-match
  // PUBLIC_PATHS list. Both read only anon-granted RPCs, so anon access is safe.
  const isPublicDynamic =
    pathname.startsWith('/u/') || pathname.startsWith('/p/')

  if (!user && !PUBLIC_PATHS.includes(pathname) && !isPublicDynamic) {
    return redirectToLogin()
  }

  if (user && pathname === '/login') {
    // [Phase 2 multi-tenant] Authenticated users land on the /home shell (the
    // teacher picker), NOT directly in a community. NOTE: this file is shared with
    // main's single-tenant app, where the landing is /community — keep that in mind
    // when merging across branches.
    return redirectPreservingCookies('/home')
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
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - common image extensions
     */
    '/((?!api/bunny/webhook|api/push/send|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
