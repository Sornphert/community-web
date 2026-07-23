import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config'

// robots.txt — allow crawlers on the PUBLIC discovery surfaces, keep the gated app
// (teacher shells, admin, auth, api) out of the index. Points at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/home', '/about', '/privacy', '/u/', '/p/'],
      disallow: [
        '/t/', // per-teacher shells — gated, membership-only
        '/admin',
        '/api/',
        '/login',
        '/reset-password',
        '/forgot-password',
        '/auth/',
        '/profile',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
