'use client'

import { useEffect } from 'react'

// Registers the site service worker (/sw.js) on load. It already exists for web
// push (lib/push/client.ts registers it on demand); registering it globally also
// satisfies the PWA installability criteria so the app can be added to the home
// screen. No-op where service workers are unavailable.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
