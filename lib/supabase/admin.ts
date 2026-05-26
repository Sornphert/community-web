import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client using the service-role key. It bypasses RLS and
// is session-independent, so it can clean up storage AFTER delete_my_account()
// has removed the user's auth.users row (their session is then invalid).
//
// NEVER import this into a Client Component — the service-role key must never
// reach the browser. SUPABASE_SERVICE_ROLE_KEY is intentionally not prefixed
// with NEXT_PUBLIC_.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
