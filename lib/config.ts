// Single source of truth for per-teacher (per-deployment) configuration.
//
// One repo / one branch serves multiple teachers as separate Vercel projects
// that differ ONLY by environment variables. Every value here falls back to
// teacher #1's current literal, so a deployment with NO env vars set behaves
// exactly as before.
//
// All vars are NEXT_PUBLIC_* because some consumers are Client Components; that
// also means they are inlined at BUILD time — a project must rebuild after
// changing them. Reference process.env.NEXT_PUBLIC_* directly (never via a
// computed key) or Next.js cannot inline the value into the client bundle.

// Brand --------------------------------------------------------------------
export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME ?? 'Johnson 天命数字投资'

// Kept separate from APP_NAME: the current <meta> description is
// "天命数字投资 community and classroom" (no "Johnson "), so it is NOT
// `${APP_NAME} community and classroom`.
export const APP_DESCRIPTION =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
  '天命数字投资 community and classroom'

export const BRAND_LOGO_URL =
  process.env.NEXT_PUBLIC_BRAND_LOGO_URL ?? '/brand.jpg'

export const HERO_URL = process.env.NEXT_PUBLIC_HERO_URL ?? '/hero.jpg'

// Domain / calendar --------------------------------------------------------
// App domain used to build the .ics UID (event.id@domain).
export const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'app.theprophetsystem.com'

// .ics PRODID. Its OWN var (not derived from APP_NAME) so it stays ASCII —
// deriving `-//${APP_NAME}//Events//EN` would inject non-ASCII brand text and
// break strict calendar parsers.
export const ICS_PRODID =
  process.env.NEXT_PUBLIC_ICS_PRODID ?? '-//The Prophet System//Events//EN'

// Timezone -----------------------------------------------------------------
// IANA zone for all display/bucketing Intl calls.
export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE ?? 'Asia/Kuala_Lumpur'

// Fixed numeric UTC offset (e.g. '+08:00'). VALID ONLY for a DST-free zone —
// see lib/datetime.ts klWallClockToUtcIso. Teacher #2 shares teacher #1's zone
// (no DST), so a fixed offset is exact for both.
export const TIMEZONE_OFFSET =
  process.env.NEXT_PUBLIC_TIMEZONE_OFFSET ?? '+08:00'

// e.g. 'Asia/Kuala_Lumpur (+08:00)' — derived for UI labels.
export const TIMEZONE_LABEL = `${TIMEZONE} (${TIMEZONE_OFFSET})`
