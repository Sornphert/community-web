// Browser-side Web Push helpers. Imported only by client components. All calls
// assume a secure context (HTTPS or localhost) — the caller gates on
// isPushSupported() first.

import { createClient } from '@/lib/supabase/client'

// True only where the full push stack exists. On iOS Safari this is false
// unless the site has been installed to the Home Screen as a PWA — that's the
// platform caveat, not a bug.
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// VAPID public key, exposed to the browser. Empty until the env var is set.
export function vapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

// Request permission, subscribe via the PushManager, and persist the
// subscription row for the current user. Returns true on success.
export async function enablePush(): Promise<boolean> {
  const key = vapidPublicKey()
  if (!isPushSupported() || !key) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await registration()
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast: the DOM lib types applicationServerKey as BufferSource; our
    // Uint8Array<ArrayBufferLike> is compatible at runtime.
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  })

  const json = sub.toJSON() as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
  }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  // Upsert on endpoint: re-subscribing on the same browser refreshes the keys
  // instead of duplicating the row.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
    { onConflict: 'endpoint' },
  )
  return !error
}

// Unsubscribe this browser and drop its stored row.
export async function disablePush(): Promise<boolean> {
  if (!isPushSupported()) return false
  const reg = await registration()
  const sub = await reg.pushManager.getSubscription()
  const endpoint = sub?.endpoint
  if (sub) await sub.unsubscribe()

  if (endpoint) {
    const supabase = createClient()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
  return true
}
