# CLAUDE.md

Single source of truth for **community-web**. Read in full before extending the project.

@AGENTS.md

## Project Overview

community-web is the web counterpart to an existing Expo/React Native mobile app (**community-app**); both share one Supabase backend. It is a private, paid membership community for **"Johnson 天命数字投资"** (an investing/trading education brand) — Johnson (the teacher) plus ~30 students, with a social feed and a classroom.

- **Live:** https://app.theprophetsystem.com
- **Repo:** GitHub `Sornphert/community-web`
- **Mobile companion:** `community-app` — separate Expo/RN codebase, same Supabase project. Conventions are kept aligned: client-side JPEG conversion for all uploads, and the `?v=` avatar cache-bust.
- **Roles** are driven by `profiles.is_admin`: **members** and **admins**. Admins additionally get the Members directory and manage classroom content directly in Supabase.

## Tech Stack

- **Next.js 16** (App Router, Turbopack dev) — `next@16.2.6`
- **React 19** (`react@19.2.4`) with the **React Compiler enabled** (`next.config.ts` → `reactCompiler: true`). Do not hand-add `useMemo`/`useCallback` for perf — the compiler memoizes.
- **TypeScript** (strict)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`)
- **lucide-react** for icons
- **`@supabase/supabase-js` + `@supabase/ssr`** — NOT the deprecated `@supabase/auth-helpers`
- **Resend** for transactional email, wired into Supabase via SMTP (no npm package — see [Email Infrastructure](#email-infrastructure))
- **Vercel** hosting; **auto-deploys on every push to `main`**

### Commands

```
npm run dev     # dev server at http://localhost:3000 (Turbopack)
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint (eslint-config-next)
```

No test runner is configured.

### Definition of done

After **any** code change, run `npm run lint` **and** `npm run build`. Both must pass before a task is considered complete. There are no automated tests, so the build/lint loop is the only verification gate — do not skip it.

### Environment variables (`.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only** (no `NEXT_PUBLIC_` prefix). Used by `lib/supabase/admin.ts` to delete storage objects during account deletion, after the user's `auth.users` row (and session) is gone. Never expose to the browser.

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
      sidebar.tsx                  # desktop rail + mobile brand bar + mobile bottom tabs (Client)
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
      actions.ts                     # server action: deleteMyAccount (RPC + storage cleanup)
      _components/profile-form.tsx
lib/
  supabase/client.ts               # browser client — sync createClient()
  supabase/server.ts               # server client — async createClient()
  supabase/admin.ts                # server-only service-role client — createAdminClient()
  types.ts                         # TS types matching the DB schema (source of truth)
  posts.ts                         # server fetchers: posts, comments, members
  classroom.ts                     # server fetchers: topics, content, progress
  format.ts                        # formatRelativeTime()
  image.ts                         # convertToJpg() — browser-only, canvas-based
  vimeo.ts                         # parses Vimeo URLs for the classroom player
proxy.ts                           # ROOT, not app/. Session refresh + auth gating.
next.config.ts                     # reactCompiler + image remotePatterns
public/                            # brand.jpg, hero.jpg, and other static assets
```

- Co-located UI lives in `_components/` folders next to the route that uses it.
- Each dynamic route ships `loading.tsx`, `error.tsx`, and `not-found.tsx` boundaries.

## Data Model (Supabase Schema)

All tables are in the `public` schema. **`lib/types.ts` is the authoritative schema mirror** — there is no generated `Database` type, and raw embed-query row shapes are described locally in `lib/posts.ts` / `lib/classroom.ts`. When schema and this doc disagree, trust `lib/types.ts`. After any schema change, update `lib/types.ts` and the relevant local row shape together.

Tables: `profiles`, `channels`, `posts`, `post_images`, `comments`, `post_likes`, `comment_likes`, `topics`, `content_items`, `content_progress`.

Relationships and non-obvious facts that affect query/code correctness:

- **`posts.author_id` → `profiles.id`** (NOT `auth.users.id`). Because one profile exists per auth user, `profiles.id` equals the auth uid — which is why `posts` RLS can compare `auth.uid() = author_id`. **The `author:profiles(*)` embed now REQUIRES an explicit FK hint** (`author:profiles!author_id(*)`) — `post_likes`/`comment_likes` made the `posts`↔`profiles` and `comments`↔`profiles` relationships ambiguous (see [Known Gotchas](#known-gotchas-things-that-bit-us)). **Always confirm a table's actual FK target before writing nested joins.**
- `comments.author_id` → `profiles.id`; `comments.post_id` → `posts.id` (ON DELETE CASCADE). Embeds also need the hint: `author:profiles!author_id(*)`.
- `post_images.post_id` → `posts.id` (ON DELETE CASCADE); `storage_path` format `{user_id}/{post_id}/{position}.jpg`.
- `posts.channel_id` → `channels.id` (nullable — null = unassigned, surfaced in the one-time `/admin/migrate-posts` UI). `channels.post_permission` (`'all' | 'admin_only'`) controls who may post to a channel; routes are `/community/[channel]` (slug-based).
- **`post_likes`** — composite PK (`post_id`, `user_id`); `post_id` → `posts.id` (ON DELETE CASCADE), `user_id` → `profiles.id` (NOT `auth.users.id`, matching the `author_id` convention so `auth.uid() = user_id` still holds). **`comment_likes`** mirrors it: composite PK (`comment_id`, `user_id`); `comment_id` → `comments.id` (CASCADE), `user_id` → `profiles.id`. Presence of a row means "liked." Migration: `supabase/migrations/0004_post_comment_likes.sql`.
- `content_items.topic_id` → `topics.id`; `type` is `'video' | 'document'`; video URLs are Vimeo (parsed by `lib/vimeo.ts`).
- `content_progress` has a **composite PK** (`user_id`, `content_item_id`); `user_id` → `auth.users.id`, `content_item_id` → `content_items.id`. **Presence of a row means "completed."**
- `topics.is_locked` (boolean): locked topics render non-clickable and are URL-guarded.
- `profiles.is_admin` (boolean) drives all admin gating.
- `profiles.deleted_at` (timestamptz, nullable): non-null = a **tombstoned** (soft-deleted) account. The row is kept so posts/comments/likes still join to a profile and render "[Deleted user]". Set by `delete_my_account()` (see [Account Deletion](#account-deletion)). Partial index `profiles_deleted_at_idx` (where `deleted_at is not null`) supports excluding tombstoned users from the members list. Migration: `supabase/migrations/0007_account_deletion.sql`.
- **`profiles.id` has NO FK to `auth.users(id)`.** It was dropped in `0007` so a tombstoned profile can outlive the deleted `auth.users` row. `profiles.id` is still the PK and still equals the auth uid for live users (the `auth.uid() = id` RLS checks and `handle_new_user()` are unaffected).

## RLS Policies

RLS is enabled on every table and is the **only** authorization layer for client-side writes (the browser uses the anon key).

| table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `profiles` | authenticated | UPDATE own only (`auth.uid() = id`) |
| `posts` | authenticated | own only (`auth.uid() = author_id`) |
| `post_images` | authenticated | own only — gated by ownership of the parent `posts` row |
| `comments` | authenticated | own only (`auth.uid() = author_id`) |
| `post_likes` | authenticated (so counts/likers are visible to all) | INSERT/DELETE own only (`auth.uid() = user_id`); no UPDATE |
| `comment_likes` | authenticated | INSERT/DELETE own only (`auth.uid() = user_id`); no UPDATE |
| `topics` | authenticated | **admin only** (`profiles.is_admin = true`) |
| `content_items` | authenticated | **admin only** |
| `content_progress` | own only (`auth.uid() = user_id`) | own only (`auth.uid() = user_id`) |

## Storage Buckets

All buckets are **public** (readable URLs); writes are gated by RLS on `storage.objects`. **Every upload is converted to JPEG client-side via `lib/image.ts` before upload** (mobile-app convention).

| bucket | path convention | write RLS |
|---|---|---|
| `post-images` | `{user_id}/{post_id}/{position}.jpg` | INSERT/DELETE require `storage.foldername(name)[1] = auth.uid()::text` |
| `avatars` | `{user_id}/avatar.jpg` | INSERT/UPDATE/DELETE in own folder (first path segment = uid) |
| `topic-covers` | admin-managed, no strict convention | admin only |
| `content-files` | classroom documents | admin only |

The Supabase project host (`eesyjkmmyiisuaghhota.supabase.co`) is allow-listed in `next.config.ts` `images.remotePatterns` for `/storage/v1/object/public/**`.

On account deletion, the user's `avatars` and `post-images` files are removed via the service-role admin client — RLS-bypassing because the user's session no longer exists by then (see [Account Deletion](#account-deletion)).

## Auth Flow

- `/login` is the **only** public route; everything else is gated.
- **`proxy.ts`** (root) intercepts every matched request and:
  1. Refreshes the Supabase session cookie. **This runs before any gating** — never insert code between `createServerClient` and `getUser()`.
  2. Redirects unauthenticated users to `/login` (unless already there).
  3. Redirects authenticated users away from `/login` → `/community`.
  4. Redirect responses **must carry over the cookies** written during refresh — dropping them desyncs browser/server sessions and logs users out prematurely.
- **`(app)/layout.tsx`** is belt-and-suspenders: it independently calls `getUser()` and redirects to `/login` if absent, and reads `is_admin` to pass to `Sidebar`.
- **Sign up** calls `supabase.auth.signUp({ email, password, options: { data: { display_name } } })`.
- DB trigger **`handle_new_user()`** on `auth.users` INSERT creates the `profiles` row, reading `display_name` from `raw_user_meta_data` (fallback `split_part(email, '@', 1)`).
- **Email confirmation is currently DISABLED** in Supabase for testing. The signup action already handles confirmation (`if (!data.session)` → redirect to `/login` with a message), so re-enabling is config-only: Supabase → Authentication → Sign In / Providers → Email → "Confirm email".

## Account Deletion

Required for App Store / Play submission. The backend is **shared** between web and the (future) mobile app — both call the same Postgres function. Migration: `supabase/migrations/0007_account_deletion.sql` (run manually in the Supabase SQL editor).

- **`public.delete_my_account()`** — `SECURITY DEFINER`, `set search_path = public, auth`, returns `jsonb`, granted to `authenticated`. Takes **no parameters** and uses `auth.uid()`, so a caller can only delete **themselves**. All DB steps run in one transaction (atomic).
  - **Blocks admins** (returns `{ success: false, error: 'is_admin' }`) — they must be demoted by another admin first.
  - **Tombstones** the profile (`display_name = '[Deleted user]'`, `avatar_url`/`bio` null, `deleted_at = now()`, `is_admin = false`) — the row is **kept**.
  - **Keeps** posts, comments, `post_likes`, `comment_likes` (they render "[Deleted user]" via the kept profile).
  - **Deletes** `post_images` rows for the user's posts, `content_progress`, `classroom_recording_progress`, and the `auth.users` row (revokes sessions, frees the email). Defensively nulls `classroom_folders.created_by` / `classroom_recordings.created_by` for the user (ex-admin edge case).
  - **Returns** `{ success: true, storage_paths: { avatars: [...], 'post-images': [...] } }` — the caller must delete those files.
- **Storage is not transactional with the DB.** The function returns paths; `deleteMyAccount()` in `app/(app)/profile/actions.ts` deletes them after commit via the **service-role** admin client (`lib/supabase/admin.ts`), because the user's session is gone by then. A storage failure leaves orphaned files only — the account is already deleted — and surfaces `storage_cleanup_failed`.
- **Error codes** (caller maps to UI copy): `not_authenticated` → "You must be signed in."; `is_admin` → "You're an admin. Please demote yourself first via another admin before deleting your account."; `storage_cleanup_failed` → "Account couldn't be fully deleted due to a storage issue. Please contact support."
- **The web/mobile delete UI is NOT YET BUILT** (Part 2 = web, Part 3 = mobile). Part 2 imports `deleteMyAccount()` and adds the confirmation + redirect.

## Admin Gating

`profiles.is_admin` controls all admin access. The Members area is gated in three layers:

1. `sidebar.tsx` conditionally renders the Members nav item from the `isAdmin` prop.
2. `(app)/layout.tsx` fetches `is_admin` and passes it down.
3. `/members` and `/members/[id]` each guard themselves (`if (!profile?.is_admin) redirect('/community')`).

- **Classroom admin write features are NOT YET BUILT.** Admins manage `topics` and `content_items` directly in the Supabase Table Editor.
- **Topic locking:** `topics.is_locked = true` → card renders with a lock icon and no `<Link>`; direct navigation to a locked topic URL redirects to `/classroom`.

## Conventions & Patterns

**1. Server vs. Client Components**
- Default to Server Components; add `"use client"` only for interactivity.
- **Reads** use the async server client (`lib/supabase/server.ts`) from Server Components / `lib/` fetchers.
- **Writes** use either Server Actions (`actions.ts`, `"use server"` — used for auth) or the sync browser client (`lib/supabase/client.ts`) inside a client handler — used where Server Actions are awkward, e.g. file uploads. After a browser-client write, call `router.refresh()` or `router.push()`.

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
- `next/image` with `fill`: the parent must be `relative` **and** have an explicit size (e.g. `aspect-video w-full`); always set `sizes`.

**5. Path aliases:** `@/*` maps to the project root (`tsconfig.json`), e.g. `import { createClient } from '@/lib/supabase/server'`.

**6. Tailwind v4:** class names must be **literal strings** — no template-built names like `bg-${color}-500` (the compiler can't see them). Use a lookup map of full literal classes (see `avatar.tsx` `bgColors`).

**7. Cache-busting uploads:** avatars upload with `upsert: true` to a fixed path (`{user_id}/avatar.jpg`); the returned public URL gets `?v=${Date.now()}` appended to force a fresh fetch.

## Domain & Infrastructure

- **Custom domain:** `app.theprophetsystem.com` (Namecheap DNS → Vercel CNAME). Old `*.vercel.app` URLs redirect to it via Vercel's "Redirect to Another Domain".
- **SSL:** Vercel auto-provisions Let's Encrypt (allow 5–30 min after DNS verification — wait, don't panic).
- **Hosting:** Vercel free Hobby tier; auto-deploys on push to `main`.

## Email Infrastructure

Supabase auth emails are sent through **Resend** via SMTP.

- **Sender:** `noreply@theprophetsystem.com` (set in Supabase auth settings); sender name `Johnson 天命数字投资`.
- **Provider:** Resend (free tier: 3000/month, 100/day).
- **Domain verification:** DNS records on Namecheap (MX + 2 TXT) for the `send.theprophetsystem.com` subdomain.
- **Supabase SMTP:** host `smtp.resend.com`, port `587`, username `resend`, password = Resend API key.
- The existing `support@theprophetsystem.com` mailbox (managed elsewhere) is untouched, since Resend uses the `send.` subdomain.
- Resend exists because Supabase's built-in SMTP is rate-limited (~3–4 emails/hour) — too low to onboard 30 users.

## Deferred / Not Yet Built

- Email confirmation on signup (Supabase setting currently OFF)
- Password reset / forgot password
- Change email / change password from profile
- Admin write features for Classroom (create/edit topics + content)
- Edit / delete existing posts
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
- **Change the schema:** edit in the Supabase Table/SQL Editor, then update `lib/types.ts` and any local row shape in the relevant `lib/` fetcher.

## Known Gotchas (Things That Bit Us)

- **FK target:** `posts.author_id` → `profiles.id`, not `auth.users.id`. Verify FK targets before writing nested joins.
- **PostgREST embed ambiguity (`PGRST201`):** a table with FKs to *both* a parent and `profiles` (e.g. `post_likes`/`comment_likes` → `posts`/`comments` **and** `profiles`) is treated as a junction table, so `posts`↔`profiles` and `comments`↔`profiles` gain a second (many-to-many) relationship path. Any `author:profiles(*)` / `user:profiles(*)` embed then fails with *"more than one relationship was found."* Fix: add the FK-column hint — `author:profiles!author_id(*)`, `user:profiles!user_id(*)`. All such embeds live in `lib/posts.ts`. **Adding a new table that references `profiles` can silently break unrelated existing embeds** — re-check every `:profiles(` embed after such a migration.
- **Storage paths must match `{user_id}/...` exactly** or RLS *silently* rejects the upload — an off-by-one in the path is a silent permission failure, not an error.
- **`aspect-video` + `fill`** needs the parent to have an explicit size; `w-full` alone can collapse without a height context.
- **Mobile Safari vs. Chrome on iOS** differences are usually viewport units (`dvh` vs `vh`) or HEIC image decoding.
- **Vercel SSL** can take 5–30 min after DNS verification.
- **Schema doc drift:** this file's schema description can fall behind `lib/types.ts`. Types win.