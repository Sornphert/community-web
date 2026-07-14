import type { MetadataRoute } from 'next'
import { APP_NAME, BRAND_LOGO_URL } from '@/lib/config'

// Web App Manifest — makes "Add to Home Screen" install as a proper PWA (name +
// icon + standalone display) instead of a bare Safari shortcut. All values are
// env-driven, so each site (shared repo, separate deployments) gets its own
// brand. On iOS 16.4+ this icon is also used for web-push notifications.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    start_url: '/',
    display: 'standalone',
    background_color: '#010822',
    theme_color: '#010822',
    icons: [
      {
        src: BRAND_LOGO_URL,
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any',
      },
      {
        src: BRAND_LOGO_URL,
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any',
      },
    ],
  }
}
