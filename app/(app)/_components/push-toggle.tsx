'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Loader2 } from 'lucide-react'
import {
  disablePush,
  enablePush,
  getExistingSubscription,
  isPushSupported,
  vapidPublicKey,
} from '@/lib/push/client'

// Compact enable/disable control for browser push, shown in the notification
// dropdown header. Renders nothing when push isn't configured (no VAPID key) or
// isn't supported by the browser (e.g. iOS Safari outside an installed PWA).
export function PushToggle() {
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const supported = isPushSupported() && vapidPublicKey() !== ''

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    getExistingSubscription().then((sub) => {
      if (cancelled) return
      setEnabled(!!sub && Notification.permission === 'granted')
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [supported])

  if (!supported || !ready) return null

  async function toggle() {
    setBusy(true)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
      } else {
        setEnabled(await enablePush())
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg-soft transition-colors hover:bg-muted disabled:opacity-50"
      title={
        enabled
          ? 'Turn off push notifications on this device'
          : 'Get notified on this device even when the app is closed'
      }
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : enabled ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : (
        <BellOff className="h-3.5 w-3.5" />
      )}
      {enabled ? 'Push on' : 'Enable push'}
    </button>
  )
}
