'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
  // redirect() throws NEXT_REDIRECT — must stay outside any try/catch.
  redirect('/')
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

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
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
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  revalidatePath('/', 'layout')
  redirect('/login')
}
