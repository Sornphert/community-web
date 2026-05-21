# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint (`eslint-config-next`)

There is no test runner configured in this project.

## Stack

- **Next.js 16** (App Router) with the **React Compiler enabled** (`next.config.ts` → `reactCompiler: true`). Do not hand-add `useMemo`/`useCallback` for perf — the compiler handles memoization.
- **React 19**, **TypeScript** (strict), **Tailwind CSS v4** (via `@tailwindcss/postcss`).
- **Supabase** for auth, Postgres, and Storage (`@supabase/ssr` + `@supabase/supabase-js`).
- Import alias `@/*` maps to the repo root (e.g. `@/lib/supabase/server`).
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in `.env.local`).

## Architecture

### Auth gating lives in `proxy.ts`, not `middleware.ts`
This Next.js version uses `proxy.ts` at the repo root as the request middleware. `proxy()` refreshes the Supabase session and gates routes: unauthenticated users are redirected to `/login`; authenticated users hitting `/login` go to `/community`. Two invariants are load-bearing (see the comments in the file): **never run code between `createServerClient` and `supabase.auth.getUser()`**, and **redirects must carry over the cookies written during session refresh** or the browser/server sessions desync and log users out.

### Three Supabase clients for three contexts
- `lib/supabase/server.ts` — `createClient()` for Server Components / Server Actions (reads cookies via `next/headers`; cookie writes are no-ops in RSC and that's expected).
- `lib/supabase/client.ts` — `createClient()` for the browser (Client Components).
- `proxy.ts` — its own server client wired to the request/response cookie cycle.

### Reads on the server, writes from the browser
- **Reads**: Server Components fetch through helpers in `lib/posts.ts`, which run Supabase embed queries (`select('*, author:profiles(*), images:post_images(*), comments(count)')`). There is **no generated `Database` type** — raw row shapes are described locally in `lib/posts.ts` and mapped onto the public types in `lib/types.ts`. Keep those two in sync when changing queries.
- **Writes**: Mutations (create post, add comment, image upload) happen **client-side** via the browser client and rely on Supabase **RLS** for authorization, then call `router.refresh()` / `router.push()`. See `app/(app)/community/new/_components/new-post-form.tsx` and `.../[id]/_components/comment-form.tsx`.
- **Exception — auth**: sign in/up/out are **Server Actions** in `app/login/actions.ts`. `redirect()` throws `NEXT_REDIRECT`, so it must stay outside any `try/catch`.

### Route structure
- `app/page.tsx` (`/`) is a pure redirector → `/login` or `/community`.
- `app/login/` — public auth page + actions.
- `app/(app)/` — route group for everything behind auth; its `layout.tsx` re-checks the user (belt-and-suspenders with the proxy) and renders the `Sidebar` (desktop rail + mobile bottom tab bar). Pages: `community` (feed), `community/[id]` (post detail + comments), `community/new`, `classroom`, `members`, `profile`. Co-located UI lives in `_components/` folders.

### Images
`lib/image.ts` `convertToJpg()` is **browser-only** (uses canvas) — it downscales and re-encodes uploads to JPEG before they go to the `post-images` Storage bucket, keyed by path `{userId}/{postId}/{index}.jpg`. `post_images` rows store the public URL plus `position` for ordering.
