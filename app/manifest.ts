import type { MetadataRoute } from 'next'
import {
  PLATFORM_NAME,
  PLATFORM_DESCRIPTION,
  PLATFORM_LOGO_URL,
} from '@/lib/config'

// Web app manifest (Next.js metadata route → /manifest.webmanifest). Makes the app
// installable to the home screen. Icons reuse the platform logo (1080×1080), declared
// at the sizes browsers look for; the SW is registered globally (ServiceWorkerRegister)
// so the installability criteria are met.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PLATFORM_NAME,
    short_name: PLATFORM_NAME,
    description: PLATFORM_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: PLATFORM_LOGO_URL, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: PLATFORM_LOGO_URL, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: PLATFORM_LOGO_URL, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
