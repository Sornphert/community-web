# CLAUDE.md

This file is the single source of truth for onboarding to **community-web**. Read it in full before extending the project — it documents the stack, structure, data model, RLS, conventions, infrastructure, history, and the mistakes already made so they aren't repeated.

@AGENTS.md

## Project Overview

community-web is the web counterpart to an existing Expo/React Native mobile app (**community-app**). Both share the same Supabase backend.

- **Who it's for:** Johnson (the teacher) and his ~30 students — a small, paid private community with a social feed and a classroom.
- **Live URL:** https://app.theprophetsystem.com
- **Repo:** GitHub at `Sornphert/community-web`
- **Mobile companion:** `community-app` (separate Expo/React Native codebase, same Supabase project). Conventions are kept aligned across the two — most notably client-side JPEG conversion for all uploads and the `?v=` avatar cache-bust.

The app is a private membership community for **"Johnson 天命数字投资"** (an investing/trading education brand). Two roles exist, driven by `profiles.is_admin`: **members** and **admins** (admins additionally get the Members directory and manage classroom content directly in Supabase).

## Tech Stack

- **Next.js 16** (App Router, Turbopack dev bundler) — `next@16.2.6`
- **React 19** (`react@19.2.4`) with the **React Compiler enabled** (`next.config.ts` → `reactCompiler: true`, via `babel-plugin-react-compiler`). Do not hand-add `useMemo`/`useCallback` for perf — the compiler memoizes.
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **lucide-react** for icons
- **`@supabase/supabase-js` + `@supabase/ssr`** for auth, Postgres, Storage. NOT the deprecated `@supabase/auth-helpers`.
- **Resend** for transactional email, wired into Supabase via SMTP (no npm package — see [Email Infrastructure](#email-infrastructure)).
- **Vercel** for hosting; **auto-deploys on every push to `main`**.

### Commands

```
npm run dev     # dev server at http://localhost:3000 (Turbopack)
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint (eslint-config-next)
```

There is no test runner configured.

### Environment variables (`.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Project Structure

```
app/
  layout.tsx                       # root layout: html/body, Geist fonts, metadata
  page.tsx                         # "/" — redirect router only (→ /login or /community)
  icon.jpg                         # favicon (Next.js auto-detects app/icon.*)
  globals.css                      # Tailwind v4 entry
  login/
    page.tsx                       # auth UI — Client Component wrapped in <Suspense>
    actions.ts                     # server actions: signIn, signUp, signOut
  (app)/                           # route group: everything behind auth
    layout.tsx                     # auth gate; fetches user + isAdmin; renders Sidebar
    loading.tsx / error.tsx        # group-level boundaries
    _components/
      sidebar.tsx                  # desktop rail + mobile top brand bar + mobile bottom tabs (Client)
      avatar.tsx                   # reusable Avatar with initials fallback (Client)
    community/
      page.tsx                     # feed (hero banner + post list)
      _components/post-card.tsx
      [id]/                        # post detail + comments (+ loading/error/not-found)
        _components/comment-form.tsx
      new/                         # create post
        _components/new-post-form.tsx
    classroom/
      page.tsx                     # topic grid
      _components/topic-card.tsx
      topic/[id]/                  # topic content list (+ loading/error/not-found)
        _components/content-row.tsx
      content/[id]/                # content viewer: video/document (+ boundaries)
        _components/complete-toggle.tsx
    members/
      page.tsx                     # members directory (admin only)
      [id]/                        # member profile (admin only)
    profile/
      page.tsx                     # self-edit profile
      _components/profile-form.tsx
lib/
  supabase/client.ts               # browser client — sync createClient()
  supabase/server.ts               # server client — async createClient()
  types.ts                         # TS types matching the DB schema
  posts.ts                         # server fetchers: posts, comments, members
  classroom.ts                     # server fetchers: topics, content, progress
  format.ts                        # formatRelativeTime()
  image.ts                         # convertToJpg() — browser-only, canvas-based
proxy.ts                           # ROOT, not app/. Session refresh + auth gating.
next.config.ts                     # reactCompiler + image remotePatterns
public/                            # brand.jpg, hero.jpg, and other static assets
```

Notes:
- Co-located UI lives in `_components/` folders next to the route that uses it.
- Each dynamic route ships `loading.tsx`, `error.tsx`, and `not-found.tsx` boundaries.
- The import alias `@/*` maps to the project root (`tsconfig.json`), e.g. `import { createClient } from '@/lib/supabase/server'`.

## Data Model (Supabase Schema)

All tables live in the `public` schema. The TypeScript mirrors are in `lib/types.ts`; there is **no generated `Database` type** — raw embed-query row shapes are described locally in `lib/posts.ts`/`lib/classroom.ts` and mapped onto the public types. Keep types and queries in sync.

### `profiles`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | FK → `auth.users.id`; one profile per auth user |
| `display_name` | text | shown across the app |
| `bio` | text, nullable | |
| `avatar_url` | text, nullable | public Storage URL (with `?v=` cache-bust) |
| `created_at` | timestamptz | |
| `is_admin` | boolean | drives admin gating |

### `posts`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `author_id` | uuid FK → **`profiles.id`** | **not** `auth.users.id` — see note below |
| `title` | text | optional in the UI |
| `body` | text | required in the UI |
| `created_at` | timestamptz | feed orders by this, desc |

### `post_images`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `post_id` | uuid FK → `posts.id` (ON DELETE CASCADE) | |
| `url` | text | public Storage URL |
| `storage_path` | text | `{user_id}/{post_id}/{position}.jpg` |
| `position` | int | display order |
| `created_at` | timestamptz, nullable | |

### `comments`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `post_id` | uuid FK → `posts.id` (CASCADE) | |
| `author_id` | uuid FK → `profiles.id` (CASCADE) | |
| `body` | text | |
| `created_at` | timestamptz | |

### `topics`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `description` | text, nullable | |
| `cover_image_url` | text, nullable | |
| `cover_storage_path` | text, nullable | |
| `position` | int | grid order |
| `created_at` | timestamptz, nullable | |
| `is_locked` | boolean | locked topics are non-clickable + URL-guarded |

### `content_items`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `topic_id` | uuid FK → `topics.id` | |
| `type` | `'video' \| 'document'` | |
| `title` | text | |
| `description` | text, nullable | |
| `video_url` | text, nullable | Vimeo URL (parsed by `lib/vimeo.ts`) |
| `document_url` | text, nullable | opened in a new tab |
| `document_storage_path` | text, nullable | |
| `thumbnail_url` | text, nullable | |
| `thumbnail_storage_path` | text, nullable | |
| `position` | int | lesson order |
| `created_at` | timestamptz, nullable | |

### `content_progress`
| column | type | notes |
|---|---|---|
| `user_id` | uuid | composite PK part; FK → `auth.users.id` |
| `content_item_id` | uuid | composite PK part; FK → `content_items.id` |
| `completed_at` | timestamptz | presence of a row = completed |

> **FK gotcha:** `posts.author_id` references **`profiles.id`**, not `auth.users.id`. Because of this, the Supabase nested-join shorthand `author:profiles(*)` resolves without an explicit FK hint (`author:profiles!posts_author_id_fkey(*)` is not needed). Always confirm a table's actual FK target before writing nested joins.

## RLS Policies

RLS is enabled on every table and is the **only** authorization layer for client-side writes (the browser uses the anon key). Policies:

| table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `profiles` | authenticated | UPDATE only own (`auth.uid() = id`) |
| `posts` | authenticated | own only (`auth.uid() = author_id`) |
| `post_images` | authenticated | own only — gated by ownership of the parent `posts` row (`auth.uid() = author_id`) |
| `comments` | authenticated | own only (`auth.uid() = author_id`) |
| `topics` | authenticated | **admin only** (`profiles.is_admin = true`) |
| `content_items` | authenticated | **admin only** |
| `content_progress` | own only (`auth.uid() = user_id`) | own only (`auth.uid() = user_id`) |

## Storage Buckets

All buckets are **public** (readable URLs), with writes gated by RLS on `storage.objects`. **Every upload is converted to JPEG client-side via `lib/image.ts` before upload**, matching the mobile app convention.

| bucket | path convention | write RLS |
|---|---|---|
| `post-images` | `{user_id}/{post_id}/{position}.jpg` | INSERT/DELETE require `storage.foldername(name)[1] = auth.uid()::text` |
| `avatars` | `{user_id}/avatar.jpg` | INSERT/UPDATE/DELETE in own folder (first path segment = uid) |
| `topic-covers` | admin-managed, no strict convention | admin only |
| `content-files` | classroom documents | admin only |

The Supabase project hostname (`eesyjkmmyiisuaghhota.supabase.co`) is allow-listed in `next.config.ts` `images.remotePatterns` for `/storage/v1/object/public/**` so `next/image` can serve bucket images.

## Auth Flow

- `/login` is the **only** public route. Everything else is gated.
- **`proxy.ts`** (root) intercepts every matched request and:
  1. Refreshes the Supabase session cookie. **This runs before any gating** — never insert code between `createServerClient` and `getUser()`.
  2. Redirects unauthenticated users to `/login` (unless already there).
  3. Redirects authenticated users away from `/login` → `/community`.
  4. Redirect responses **carry over the cookies** written during refresh — dropping them desyncs browser/server sessions and logs users out prematurely.
- **`(app)/layout.tsx`** is belt-and-suspenders: it independently calls `getUser()` and redirects to `/login` if absent, in case the proxy is bypassed. It also reads `is_admin` here and passes it to `Sidebar`.
- **Sign up** calls `supabase.auth.signUp({ email, password, options: { data: { display_name } } })`.
- A database trigger **`handle_new_user()`** on `auth.users` INSERT creates the `profiles` row, reading `display_name` from `raw_user_meta_data` (falling back to `split_part(email, '@', 1)`).
- **Email confirmation** is currently **DISABLED** in Supabase for easier testing. The signup action already handles the confirmation case (`if (!data.session)` → redirect to `/login` with a "check your email" message), so re-enabling is config-only: Supabase → Authentication → Sign In / Providers → Email → toggle "Confirm email".
- **Not built:** password reset, change email, change password.

## Admin Gating

`profiles.is_admin` controls all admin access. The Members area is gated in three layers:

1. `sidebar.tsx` conditionally renders the Members nav item from the `isAdmin` prop.
2. `(app)/layout.tsx` fetches `is_admin` and passes it to the sidebar.
3. `/members` and `/members/[id]` each guard themselves (`if (!profile?.is_admin) redirect('/community')`).

- **Classroom admin write features are NOT YET BUILT.** Admins manage `topics` and `content_items` directly in the Supabase Table Editor.
- **Topic locking:** `topics.is_locked = true` renders the card with a lock icon and no `<Link>` (non-clickable), and direct navigation to a locked topic URL redirects to `/classroom`.

## Conventions & Patterns

Rules to follow when extending the project:

**1. Server vs. Client Components**
- Default to Server Components.
- Add `"use client"` only for interactivity (`useState`/`useEffect`/hooks).
- **Reads** use the async server client (`lib/supabase/server.ts`), called from Server Components / fetchers in `lib/`.
- **Writes** use either:
  - **Server Actions** (`actions.ts`, `"use server"`) — used for auth.
  - **Browser client** (`lib/supabase/client.ts`, sync) inside a client handler — used where Server Actions are awkward, e.g. file uploads (post images, avatar). After a write, call `router.refresh()` or `router.push()`.

**2. Server Action gotchas**
- `redirect()` throws `NEXT_REDIRECT` — **never** wrap it in `try/catch`.
- `cookies()` is async (Next.js 15+) — `await` it.
- `server.ts`'s cookie `setAll()` swallows errors in read-only (RSC) contexts — this is **correct**; the proxy owns cookie writes.

**3. Dynamic route params are a Promise** (Next.js 15+)
```ts
async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}
```

**4. Image handling**
- Local images (`public/`): `<Image>` from `next/image`.
- Remote Supabase Storage images: `<Image>` (host is in `remotePatterns`) **or** `<img>` with `{/* eslint-disable-next-line @next/next/no-img-element */}`.
- Blob preview URLs (`URL.createObjectURL`): use `<img>` + eslint-disable — `next/image` can't handle `blob:` URLs.
- Avatars use `unoptimized` so the `?v=` cache-bust query survives the optimizer.

**5. Path aliases:** `@/*` → project root (see `tsconfig.json`).

**6. Tailwind v4:** class names must be **literal strings** — no template-built names like `bg-${color}-500` (the compiler can't see them). Use a lookup map of full literal classes (see `avatar.tsx` `bgColors`).

**7. `next/image` with `fill`:** the parent must be `relative` **and** have an explicit size (e.g. `aspect-video w-full`). Always set `sizes` for correct variant fetching.

**8. Cache-busting uploads:** avatars upload with `upsert: true` to a fixed path (`{user_id}/avatar.jpg`); the returned public URL gets `?v=${Date.now()}` appended (mobile convention) to force a fresh fetch.

## Domain & Infrastructure

- **Custom domain:** `app.theprophetsystem.com` (Namecheap DNS → Vercel CNAME).
- Old URLs (`johnson-the-prophet-system.vercel.app`, `community-web-tau.vercel.app`) redirect to the custom domain via Vercel's "Redirect to Another Domain".
- **SSL:** Vercel auto-provisions Let's Encrypt (allow 5–30 min after DNS verification).
- **Hosting:** Vercel free Hobby tier; **auto-deploys on push to `main`**.

## Email Infrastructure

Transactional email (Supabase auth emails) is sent through **Resend** via SMTP.

- **Sender:** `noreply@theprophetsystem.com` (set in Supabase auth settings).
- **Provider:** Resend (free tier: 3000 emails/month, 100/day).
- **Domain verification:** DNS records on Namecheap (MX + 2 TXT) for the `send.theprophetsystem.com` subdomain.
- **Supabase SMTP settings:**
  - Host: `smtp.resend.com`
  - Port: `587`
  - Username: `resend`
  - Password: Resend API key
  - Sender name: `Johnson 天命数字投资`
- The existing `support@theprophetsystem.com` mailbox (managed elsewhere) is untouched, because Resend uses the `send.` subdomain.

## Stage-by-Stage Build History

- **W0** — Supabase SSR clients (`client.ts`, `server.ts`); `proxy.ts` session refresh.
- **W1** — Auth: login/signup UI, server actions, route gating.
- **W2** — Authenticated layout shell (sidebar + mobile bottom tab bar).
- **W2C** — Read-only community feed (post list, post detail, comments display).
- **W2P** — Writes: create post with images, create comment, edit profile, avatar upload.
- **W4** — Members directory + member profile pages.
- **W3** — Read-only Classroom: topic grid, content list, Vimeo iframe player, document open-in-new-tab, mark-complete toggle.
- **W5** — Technical polish: `next/image` migration, `loading.tsx` skeletons, `error.tsx` boundaries.
- **Branding** — brand image (`app/icon.jpg`, `public/brand.jpg`), app name "Johnson 天命数字投资", login redesign (navy `#010822` bg, rounded card, brand block, mode-aware greetings/placeholders), mobile top brand bar.
- **Topic locking** — `is_locked` column + UI gate + redirect guard.
- **Members gating** — admin-only Members tab.
- **Infra** — custom domain + Resend email.
- **Hero banner** on `/community` (full-bleed on mobile, 3:1 banner on desktop).

## Deferred / Not Yet Built

- Email confirmation on signup (Supabase setting currently OFF)
- Password reset / forgot password
- Change email / change password from profile
- Admin write features for Classroom (W3A — create/edit topics + content)
- Edit / delete existing posts
- Likes / reactions
- Notifications
- Search / filter on members
- Pagination on feeds (currently fetches all rows)
- Real-time updates (Supabase Realtime is not used)
- Toast notification library (currently inline error/success messages)

## Common Tasks

- **Add a page:** create `app/(app)/{route}/page.tsx` as a Server Component; fetch via `createClient` from `lib/supabase/server.ts`.
- **Add a data fetcher:** add an `async` function to `lib/posts.ts` or `lib/classroom.ts` that throws on error.
- **Add an admin-only route:** put the `is_admin` redirect guard at the top of the page (see `members/page.tsx`).
- **Add a write/form:** usually a Client Component — `useState` + a submit handler that calls `createClient` from `lib/supabase/client.ts`, then `router.refresh()`/`router.push()`.
- **Change the schema:** edit it in the Supabase Table/SQL Editor, then update the matching type in `lib/types.ts` (and any local row shape in the relevant `lib/` fetcher).

## Known Gotchas (Things That Bit Us)

- **FK assumption:** `posts.author_id` points to `profiles.id`, not `auth.users.id`. Verify FK targets before writing nested joins.
- **Storage paths must match `{user_id}/...` exactly** or RLS silently rejects the upload — an off-by-one in the path is a silent permission failure.
- **Vercel SSL** can take 5–30 min after DNS verification. Wait, don't panic.
- **Supabase built-in SMTP is rate-limited** (~3–4 emails/hour) — too low to onboard 30 users, which is why Resend exists.
- **`aspect-video` + `fill`** needs the parent to have an explicit size; `w-full` alone can collapse without a height context.
- **Mobile Safari vs. Chrome on iOS** differences are usually viewport units (`dvh` vs `vh`) or HEIC image decoding.
