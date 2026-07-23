import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config'
import { createClient } from '@/lib/supabase/server'
import { getPublicFeed } from '@/lib/public-feed'

// Regenerate hourly so newly-public posts/profiles get crawled without a redeploy.
export const revalidate = 3600

// Public sitemap: the discovery surfaces only (never the gated /t, /admin, auth, api).
// Dynamic entries are derived from the SAME public feed the site exposes, so a post or
// profile is listed only if it's already publicly visible.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now },
    { url: `${SITE_URL}/home`, lastModified: now },
    { url: `${SITE_URL}/about`, lastModified: now },
    { url: `${SITE_URL}/privacy`, lastModified: now },
  ]

  let dynamicEntries: MetadataRoute.Sitemap = []
  try {
    const supabase = await createClient()
    // up to the RPC cap (100) — plenty for now; paginate here if the corpus grows.
    const posts = await getPublicFeed(supabase, 0, 100)

    const postEntries = posts.map((p) => ({
      url: `${SITE_URL}/p/${p.post_id}`,
      lastModified: new Date(p.created_at),
    }))

    const seenProfiles = new Set<string>()
    const profileEntries: MetadataRoute.Sitemap = []
    for (const p of posts) {
      const key = `${p.teacher_slug}/${p.author_id}`
      if (seenProfiles.has(key)) continue
      seenProfiles.add(key)
      profileEntries.push({
        url: `${SITE_URL}/u/${p.teacher_slug}/${p.author_id}`,
        lastModified: now,
      })
    }

    dynamicEntries = [...postEntries, ...profileEntries]
  } catch {
    // Feed hiccup — still return the static routes rather than failing the sitemap.
  }

  return [...staticEntries, ...dynamicEntries]
}
