import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles the link in Supabase recovery / confirmation emails. The email
// template points here with token_hash + type + next; we verify the token
// (which sets the session cookies via the server client) and forward the user
// on to `next` (default '/'). A recovery link passes next=/reset-password,
// which detects a missing session and shows an "invalid or expired" message.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')

  // Resolve `next` (the template passes the full RedirectTo URL) to a
  // same-origin path; default to '/' (deployment-neutral: the root router
  // self-resolves — MT '/'→'/home', main '/'→'/community'). Guards against
  // open-redirect. A recovery link passes next=/reset-password explicitly.
  const dest = request.nextUrl.clone()
  dest.search = ''
  dest.pathname = '/'
  if (next) {
    try {
      const url = new URL(next, request.nextUrl.origin)
      if (url.origin === request.nextUrl.origin) {
        dest.pathname = url.pathname
      }
    } catch {
      // Malformed `next` — keep the default destination.
    }
  }

  // Two confirmation link formats both land here and establish the session:
  //   • token_hash + type  → custom email template ({{ .TokenHash }}); verifyOtp.
  //   • code               → the DEFAULT Supabase template, whose /auth/v1/verify
  //     endpoint redirects here with a PKCE ?code after confirming; exchange it.
  // Whichever succeeds sets the session cookies via the server client, then we forward
  // the (now signed-in) user to `dest`.
  const code = searchParams.get('code')

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(dest)
    }
  } else if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(dest)
    }
  }

  return NextResponse.redirect(dest)
}
