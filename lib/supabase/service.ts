import { createClient } from '@supabase/supabase-js'

// Server-only service-role client. Bypasses RLS, so it must NEVER be imported
// into a Client Component or any user-facing code path. The only caller is the
// Bunny webhook (app/api/bunny/webhook/route.ts), which runs unauthenticated
// from a user perspective — Bunny is not logged in — and needs to update
// classroom_recordings rows it doesn't "own".
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Service-role client not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
