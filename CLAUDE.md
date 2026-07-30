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

Tables: `profiles`, `channels`, `posts`, `post_images`, `comments`, `post_likes`, `comment_likes`, `topics`, `content_items`, `content_progress`, `events`.

Relationships and non-obvious facts that affect query/code correctness:

- **`posts.author_id` → `profiles.id`** (NOT `auth.users.id`). Because one profile exists per auth user, `profiles.id` equals the auth uid — which is why `posts` RLS can compare `auth.uid() = author_id`. **The `author:profiles(*)` embed now REQUIRES an explicit FK hint** (`author:profiles!author_id(*)`) — `post_likes`/`comment_likes` made the `posts`↔`profiles` and `comments`↔`profiles` relationships ambiguous (see [Known Gotchas](#known-gotchas-things-that-bit-us)). **Always confirm a table's actual FK target before writing nested joins.**
- `comments.author_id` → `profiles.id`; `comments.post_id` → `posts.id` (ON DELETE CASCADE). Embeds also need the hint: `author:profiles!author_id(*)`.
- `post_images.post_id` → `posts.id` (ON DELETE CASCADE); `storage_path` format `{user_id}/{post_id}/{position}.jpg`.
- `posts.channel_id` → `channels.id` (nullable — null = unassigned, surfaced in the one-time `/admin/migrate-posts` UI). `channels.post_permission` (`'all' | 'admin_only'`) controls who may post to a channel; routes are `/community/[channel]` (slug-based).
- **"Johnson Weekly 市场报告" — a two-level structure (MONTHS → WEEKS → POSTS), migration `0014_weekly_months.sql`.** A **month** is a `week_groups` row (`id`, manual `name`, hidden `position` sort key, `created_at`; RLS = authenticated SELECT + admin writes, mirroring `channels`). A **week** is a `channels` row with `section='weekly'`, `post_permission='admin_only'`, `group_id` → its month, and `week_number` (its **per-month** sort key). `channels.section` (text NOT NULL DEFAULT `'community'`, CHECK `in ('community','weekly')`) partitions channels; `channels.group_id` (uuid, FK → `week_groups`, NO ACTION) + the `channels_weekly_has_group` CHECK (`section<>'weekly' OR group_id IS NOT NULL`) enforce **strict**: every week belongs to exactly one month. A week IS a channel — posts/comments/attachments/likes/RLS reused unchanged.
  - **Key invariant:** `week_number` (per-month display order) and `slug` (a GLOBAL unique id, `'week-'+globalN`) are **independent**. `addWeek(groupId, name)` sets `week_number = per-month max+1` and seeds `slug` from the global weekly count; on a 23505 slug collision it bumps **only** the slug suffix, never `week_number`/`group_id`.
  - **LEAK-GUARD:** `getChannels()` filters `section='community'` so weekly channels never appear in Community nav/tabs. Hub fetchers: `getMonths()` (week_groups, `position DESC`, `channels(count)` embed) and `getWeeksForMonth(groupId)` (`section='weekly'` + `group_id`, `week_number DESC`, `posts(count)`); `getWeekGroup(id)` for headers/back-links. Admin self-service: `addMonth(name)` / `addWeek(groupId, name)` in `app/(app)/weekly/actions.ts` (`requireAdmin` + RLS; empty-name fallbacks `'Untitled month'` / `'Week N'`).
  - **Routing (prefixed):** `/weekly` (month cards + Add Month) → `/weekly/m/[month]` (that month's week cards + Add Week) → `/weekly/week-N` (posts; weeks stay at the **flat** slug URL — the month layer is grouping only) → `/weekly/week-N/[postId]` (+ `/new`, `/edit`), reusing the post components via the `basePath='/weekly'` prop. `/community/[channel]` (+ `/new`, `/[postId]`) redirects/404s any `section='weekly'` resolution to its canonical `/weekly/week-N`, so no week is reachable under two URLs. Gated by `NEXT_PUBLIC_SHOW_WEEKLY` (default OFF — gates the sidebar entry, Add Month/Add Week, and all `/weekly` routes, which 404 when off).
  - **Weekly posting convention:** post each week in chronological order (Friday's question first, then Monday's answer). The week feed orders by `created_at DESC` (there is no `posts.position` column), so do **not** backfill or back-date posts within a week — a back-dated post cannot be forced to the top.
- **`post_likes`** — composite PK (`post_id`, `user_id`); `post_id` → `posts.id` (ON DELETE CASCADE), `user_id` → `profiles.id` (NOT `auth.users.id`, matching the `author_id` convention so `auth.uid() = user_id` still holds). **`comment_likes`** mirrors it: composite PK (`comment_id`, `user_id`); `comment_id` → `comments.id` (CASCADE), `user_id` → `profiles.id`. Presence of a row means "liked." Migration: `supabase/migrations/0004_post_comment_likes.sql`.
- `content_items.topic_id` → `topics.id`; `type` is `'video' | 'document'`; video URLs are Vimeo (parsed by `lib/vimeo.ts`).
- `content_progress` has a **composite PK** (`user_id`, `content_item_id`); `user_id` → `auth.users.id`, `content_item_id` → `content_items.id`. **Presence of a row means "completed."**
- `topics.is_locked` (boolean): locked topics render non-clickable and are URL-guarded.
- `profiles.is_admin` (boolean) drives all admin gating.
- `profiles.deleted_at` (timestamptz, nullable): non-null = a **tombstoned** (soft-deleted) account. The row is kept so posts/comments/likes still join to a profile and render "[Deleted user]". Set by `delete_my_account()` (see [Account Deletion](#account-deletion)). Partial index `profiles_deleted_at_idx` (where `deleted_at is not null`) supports excluding tombstoned users from the members list. Migration: `supabase/migrations/0007_account_deletion.sql`.
- **`profiles.id` has NO FK to `auth.users(id)`.** It was dropped in `0007` so a tombstoned profile can outlive the deleted `auth.users` row. `profiles.id` is still the PK and still equals the auth uid for live users (the `auth.uid() = id` RLS checks and `handle_new_user()` are unaffected).
- **`events`** — admin-curated community calendar at `/events`. `starts_at`/`ends_at` are **NOT NULL** UTC timestamptz; stored UTC, displayed in `Asia/Kuala_Lumpur` (+08:00, no DST) via `lib/datetime.ts`. `created_by` → `auth.users.id` (NOT `profiles`) `ON DELETE SET NULL` — no profile embed, so no PostgREST ambiguity (same rationale as `classroom_recordings`). Single-tenant: **no `teacher_slug`**. Type `CommunityEvent` in `lib/types.ts` (named to avoid shadowing the DOM `Event`). Fetcher `lib/events.ts` `getEvents()`; admin writes via `app/(app)/events/actions.ts` (`requireAdmin` + RLS); `.ics` export via `lib/ics.ts`. Migration: `supabase/migrations/0008_events.sql`.
- **`events.series_id`** (uuid, nullable; migration `0009_events_series.sql`): links the occurrences of a "repeat for N consecutive days" event (capped at 14, enforced in `createEvent`). NOT full recurrence — each day is a **materialized row**, so the calendar renders them with no special-casing and edit stays per-occurrence. `createEvent` builds occurrences by incrementing the **KL calendar date** (`addDaysToDateKey` in `lib/datetime.ts`) then converting each day to UTC via `klWallClockToUtcIso` — never a 24h-in-UTC shift. `deleteEvent({ scope: 'series', seriesId })` removes the whole series; default scope deletes one row.

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
| `events` | authenticated | **admin only** (`profiles.is_admin = true`) — mirrors `classroom_recordings` |

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

- **Classroom admin is fully built** on `phase-2-multitenant` (see [Classroom admin](#classroom-admin-phase-2)). The old note ("manage in the Supabase Table Editor") is obsolete for that branch.
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

## Phase-2 (multitenant) — features added

Branch **`phase-2-multitenant`** (deploys to `app.thetreewisdom.com`) converts the app to multi-tenant: `teachers` + `memberships` tables, `teacher_id` on every spine table, `/t/[slug]/…` routes, and the SECURITY DEFINER RPCs `has_membership(teacher_id)` / `is_teacher_admin(teacher_id)` that mirror RLS. Standalone hand-run migrations live in `supabase/multitenant/` (numbered) and are reconciled ZERO-DELTA into `supabase/multitenant/schema.sql`. On top of the MT base, these features were added (each = a numbered migration applied to `community-mt-dev` + reconciled into `schema.sql`):

- **Pinned posts** (`0031`) — `posts.pinned_at` + `set_post_pinned` RPC; admin pin/unpin, pinned-first ordering + badge.
- **Emoji reactions** (`0032`) — `post_reactions` (PK post_id,user_id,emoji); optimistic reaction bar on card + detail.
- **Polls** (`0033`) — `polls` / `poll_options` / `poll_votes`; optional poll composer in the post form, single/multi-choice with live % bars.
- **Direct messages** (`0034`, same-community only) — `dm_threads` (canonical `user_a<user_b`, teacher-scoped) + `dm_messages`; SECURITY DEFINER RPCs `get_or_create_dm_thread` / `send_dm` / `mark_dm_read` / `dm_unread_count`. `/t/[slug]/messages` list + thread view; "Message" button on member profiles.
- **DM notifications** (`0035`) — `notifications.type` gains `direct_message` + `thread_id`; `send_dm` inserts a notification (reuses the bell + realtime + web-push webhook).
- **Per-channel unread dots** (`0036`) — `channel_reads`; dot in the sidebar channel list + mobile tabs, cleared on view.
- **Realtime DMs** — the open thread subscribes to `dm_messages` inserts; `dm_messages` added to the `supabase_realtime` publication.
- **QoL** — global **toasts** (`app/_components/toast.tsx`), **image lightbox** (post/comment images), **PWA install** (`app/manifest.ts` + `ServiceWorkerRegister` + apple-web-app metadata), auto-linkified URLs in `MentionText`, copy-link on post detail, member-directory search, and a decluttered mobile nav (primary bottom bar + top-right hamburger overflow; theme toggle available in-shell; "Following" moved into the nav).
- Primary/`inverse` color softened from near-black to grey in `app/globals.css`.

## Classroom admin (phase-2)

Unified admin hub at **`/t/[slug]/admin/classroom`** ("Classroom settings"; gear entry on the Classroom tab + one card on the Admin dashboard). Every topic uses the **same** editor at `/admin/classroom/topic/[id]`: rename, cover image, access (tier tags), and lessons.

- **Video-upload lessons in any topic** (`0037`) — `content_items` gains Bunny `video_*` columns + `folder_id`; payload check allows a video item with `video_url` OR `video_id`. Lesson form has a Document/Video toggle; video reuses the Bunny TUS upload + the shared webhook (`/api/bunny/webhook` now also updates `content_items`). Member viewer plays Bunny (`PostVideoPlayer`) with a Vimeo `video_url` fallback.
- **Recordings cutover** (`0038`, data) — the old folder-based `classroom_recordings` system is retired in the admin/member UI; existing recordings flatten into `content_items` video lessons under the recordings topic (non-destructive, idempotent). `is_recordings` no longer special-cased.
- **Nested lesson folders** (`0039`) — `lesson_folders` (topic-scoped, self-nesting up to **3 levels**, app-enforced); `content_items.folder_id` places a lesson in a folder (folder delete → lessons fall back to root). Admin `LessonManager` tree (add folder/sub-folder/lesson, rename, delete); member `MemberLessonTree` renders the collapsible tree.
- **Optional lesson file** (`0040`) — a document lesson can be title + description only (payload check relaxed).
- **Topics + lessons** drag-to-reorder (auto-append at bottom; `reorderTopics` / `reorderContentItems`); topic create/rename/delete via `admin/classroom/actions.ts`. Broadened lesson file types (PDF, image, Excel, CSV, Word, PPT, txt, etc.) live in `lib/content-files.ts`.

## Launching a new teacher (production = per-teacher single-tenant)

**Live teachers each run as their own isolated single-tenant instance** — separate Supabase project + separate Vercel project (both from the **`main`** branch) + own domain — parameterized entirely by env vars. (The MT app on `app.thetreewisdom.com` is phase-2/dev; production teachers do NOT use it.) Existing Vercel projects: `community-web` (Johnson → theprophetsystem.com), `jane`, `bootcamp-community`, `jacky`. All Supabase projects live in one org (`rrrdizbmnsojcslvwrtw`); free-tier caps mean projects are often created on a second account then **transferred** into that org.

Runbook (`supabase/NEW_PROJECT_SETUP.md`) plus hard-won corrections:

1. New Supabase project → run **`main`'s** `bootstrap/schema.sql` then `seed.sql`. ⚠️ The working tree may be on `phase-2-multitenant` whose bootstrap is stale — always use the `main` versions.
2. ⚠️ **`main`'s bootstrap snapshot is missing three later migrations** — after bootstrap+seed also run `migrations_archive/` **`0015_notifications.sql`**, **`0016_push_subscriptions.sql`**, and **`0017_post_videos_multi.sql`**. Without 0015/0016 the notification bell + push tables are absent; without 0017 (`post_videos.position`) the community feed throws "Couldn't load this channel". Then `notify pgrst, 'reload schema';` (or restart the project) so PostgREST picks up the FK relationships used by feed embeds.
3. New Vercel project from the repo (branch `main`); copy an existing teacher's env vars and swap the teacher-specific ones: the 3 Supabase keys, 4 `BUNNY_STREAM_*`, and branding (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DESCRIPTION`, `NEXT_PUBLIC_BRAND_LOGO_URL`, `NEXT_PUBLIC_HERO_URL`/`NEXT_PUBLIC_SHOW_HERO`, `NEXT_PUBLIC_FAVICON_URL`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_ICS_PRODID`, `NEXT_PUBLIC_SHOW_*`). `NEXT_PUBLIC_*` bake in at build time → **redeploy after changing them**. Missing branding vars fall back to Johnson's defaults.
4. Brand assets (logo/hero/favicon): `next.config.ts` derives the allowed image host from `NEXT_PUBLIC_SUPABASE_URL`, so host them in the **teacher's own Supabase Storage** (convention: a public `brand` bucket) and use the `…/storage/v1/object/public/brand/…` URLs — do NOT commit per-teacher assets to `public/`.
5. Domain → Namecheap CNAME to the project's Vercel target; Supabase Auth → Site URL + Redirect URLs = the domain. Email confirmation is a per-teacher toggle (OFF until Resend SMTP is set for that domain).
6. Promote the teacher: `update public.profiles set is_admin = true where id = '<uid>'` after they sign up.
7. Recreate dashboard-only config per teacher: Bunny library + referrer protection + video webhook, and (if used) the Supabase Database Webhook on `notifications` → `/api/push/send`.

## Deferred / Not Yet Built

Most of the original deferred list is now **built** (see [Phase-2 additions](#phase-2-multitenant--features-added) — notifications, web push, feed pagination, member search, toasts, realtime DMs, post edit/delete, comment edit/delete + images, and full Classroom admin all exist). Still open:

- Change email from profile (change **password** exists; change email does not).
- Cross-folder drag of lessons in the classroom tree (reorder currently works only within the same folder/root).
- Auto-generated thumbnails for non-image document lessons (PDF/PPT show a generic icon; only image uploads self-thumbnail).
- Full recurring events (only "N consecutive days" materialized occurrences exist).

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
## Multi-tenant conversion
See memory/mt-app-group-breaks.md for MT conversion status, expected-broken states, and landmines for remaining verticals.
