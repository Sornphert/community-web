import { redirect } from 'next/navigation'

// `/` is a pure router. The public teacher directory lives at /home (anon-safe and
// branches on auth itself), so send EVERYONE there — logged-out included. proxy.ts
// allows '/' and '/home' for anon; the directory decides what each audience sees.
//
// redirect() throws NEXT_REDIRECT — keep it outside any try/catch.
export default function RootPage() {
  redirect('/home')
}
