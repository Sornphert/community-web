import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Handles the link in Supabase recovery / confirmation emails. The email
// template points here with token_hash + type + next; we verify the token
// (which sets the session cookies via the server client) and forward the user
// on. On any failure we still land on /reset-password, which detects the
// missing session and shows an "invalid or expired" message.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')

  // Resolve `next` (the template passes the full RedirectTo URL) to a
  // same-origin path; default to /reset-password. Guards against open-redirect.
  const dest = request.nextUrl.clone()
  dest.search = ''
  dest.pathname = '/reset-password'
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

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(dest)
    }
  }

  return NextResponse.redirect(dest)
}
