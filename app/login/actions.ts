'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// Open-redirect guard — the SINGLE point where a post-login returnTo is validated before it
// is honored. Accept ONLY a same-origin, path-ONLY value: must start with exactly one '/',
// must NOT be protocol-relative ('//' or '/\', which browsers resolve to an external host)
// and must not contain a traversal ('..'). Anything failing → null, so the caller defaults
// to '/'. A missing/empty param (the common case, incl. every single-tenant login) → null →
// '/', byte-identical to the previous fixed redirect('/').
function safeReturnPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  if (value.includes('..')) return null
  return value
}

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string | null
  const password = formData.get('password') as string | null

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  // redirect() throws NEXT_REDIRECT — must stay outside any try/catch. Honor a validated
  // returnTo (set by proxy.ts on an anon bounce); default to '/' when absent/invalid.
  redirect(safeReturnPath(formData.get('returnTo')) ?? '/')
}

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string | null
  const password = formData.get('password') as string | null
  const displayName =
    (formData.get('displayName') as string | null)?.trim() || null

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  if (!displayName) {
    return { error: 'Display name is required.' }
  }

  // Per-environment confirmation link: use the ORIGIN of the current request so a dev
  // signup emails a localhost link and a prod signup emails the prod link (Supabase has
  // only one static Site URL). The email template builds the link from {{ .RedirectTo }},
  // and this value must match an entry in the project's Redirect URLs allow-list.
  // /auth/confirm is the app's own token-hash handler (verifyOtp → session → redirect).
  const hdrs = await headers()
  const origin =
    hdrs.get('origin') ??
    (hdrs.get('host') ? `https://${hdrs.get('host')}` : '')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: origin ? `${origin}/auth/confirm` : undefined,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // No session means email confirmation is required for this project.
  if (!data.session) {
    redirect(
      '/login?message=' +
        encodeURIComponent('Check your email to confirm your account.'),
    )
  }

  revalidatePath('/', 'layout')
  // Honor a validated returnTo so a non-member who signs up from a join link lands back on it;
  // default to '/' when absent/invalid. The email-confirmation branch above is unchanged.
  redirect(safeReturnPath(formData.get('returnTo')) ?? '/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath('/', 'layout')
  // Land on the public home directory (anon-visible), not the login form.
  redirect('/home')
}
