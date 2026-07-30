# MT conversion — app-group breaks & expected states

Tracks the (app) → /t/[slug] multi-tenant conversion: known breakages and
states that look like bugs but are intentional, with when each resolves.

> **2026-07-30 refresh.** Most of this doc was written mid-port (2026-06) and had gone
> stale — it was actively misleading a codebase review. Corrections applied inline below;
> the big ones: all verticals except Weekly are now ported; content-files + post-attachments
> are now PRIVATE (0019/0020), so only topic-covers remains a public-read gap; and the
> in-app promote/demote flow now EXISTS (`set_membership_role`), which closes the sole-admin
> escape-hatch limitation. Historical "verified green" records (reproducibility,
> delete_my_account) are left intact — they're still accurate.

## Status
- Foundation (/t/[slug] layout, gate, auth helpers): committed.
- Community vertical: ported, isolation-verified, committed (2e95d52).
- Classroom, events, members, admin verticals: **PORTED** (see CLAUDE.md phase-2
  additions — full classroom admin, video lessons, folders, etc.).
- **Weekly is the only un-ported vertical** (404s everywhere under /t/[slug] — deliberate;
  see the Weekly section below).

## Expected states during Community port (verified 2026-06; mostly resolved by 2026-07)

- **old (app)/weekly deleted** during the Community port (it reused community's
  components). Weekly is now fully un-routed (404 everywhere) until ported as its
  own vertical. STILL TRUE as of 2026-07-30.
- ~~Per-teacher logo + hero image come from lib/config.ts defaults~~ — **RESOLVED.**
  The teachers table now carries `logo_url` (0002), `cover_url` (0002), and `hero_url`
  (0021); see lib/types.ts `Teacher`. Per-teacher branding is live.
- ~~Un-ported verticals (classroom, events, members, admin) 404~~ — **RESOLVED.** All
  ported; sidebar nav is teacher-prefixed. Only Weekly still 404s.

## Known landmine (historical — verticals now ported)
- ~~(app) routes read profiles.is_admin~~ — the ported verticals swapped this for
  `memberships.role` via the `is_teacher_admin` RPC during their ports. The remaining
  (app) routes (following, people, profile) are GLOBAL and the (app) layout deliberately
  reads NEITHER is_admin nor channels (there's a comment saying so). No landmine left here.
- Un-scoped spine reads under MT RLS do NOT error — they silently return cross-tenant
  rows. "It builds" proves nothing. Two-teacher persona isolation test is the only gate.
  (Kept as a permanent reminder for any future MT work.)

## Isolation gaps — mostly closed (2026-07-30 recheck)
- ~~content-files public-read~~ — **CLOSED (0019).** Bucket flipped PRIVATE; `content_files_select`
  now gates on `has_membership(((storage.foldername(name))[1])::uuid)`; files served via
  short-lived `createSignedUrls` (lib/classroom.ts `withSignedContentUrls`). post-attachments
  got the same treatment in **0020** (private + signed URLs, lib/posts.ts).
- **topic-covers STILL public-read** — `topic_covers_select` gates on `bucket_id` only, no auth
  predicate; served via getPublicUrl. A topic cover is readable cross-tenant by anyone with the
  CDN URL. LOW sensitivity (decorative classroom thumbnails). teacher-covers / teacher-logos are
  also public-read but INTENTIONALLY so (they render on the anon-readable /home directory).
  Write isolation intact everywhere (`*_insert_admin` gate on segment [1] = teacher_id).
- **Shared Bunny library** — one `BUNNY_STREAM_LIBRARY_ID` per deployment. This is a real gap
  ONLY on the shared MT dev app (community-mt-dev). In PRODUCTION every teacher is a separate
  single-tenant deployment with its own Bunny library + referrer protection (see the runbook in
  CLAUDE.md), so there's one teacher per library and nothing to leak across. Effectively moot in prod.

## Classroom port — DONE (completed 2026-07; superseded the 2026-06 sub-system split)
- Classroom fully ported and then extended well past the original A/B split. Migrations
  0037–0040 added Bunny video-upload lessons in any topic, the recordings→lessons cutover
  (`is_recordings` no longer special-cased), nested lesson folders (3 levels), and optional
  lesson files. Unified admin hub at `/t/[slug]/admin/classroom`. See CLAUDE.md "Classroom
  admin (phase-2)" for the current shape.
- The hardcoded single-tenant `RECORDINGS_TOPIC_ID` UUID is GONE — recordings entry topic
  is per-teacher via `topics.is_recordings` (partial-unique-indexed). (Still true.)

## Weekly — intentionally skipped (revisit with parameterization pass)
- old (app)/weekly was deleted during the Community port; /t/[slug]/weekly NOT built.
- Weekly 404s everywhere — this is DELIBERATE, not a bug.
- Decision: skip Weekly for now; port it later together with its per-teacher on/off
  switch (needs the teachers.config settings column, same as branding). Building it
  now would mean a global flag + a retrofit later; building it later = one clean pass.

## MT reproducibility — DONE (verified green 2026-06-24)

community-mt-dev is now reproducible from repo files. Run order on a fresh project:
`supabase/multitenant/schema.sql` → `supabase/multitenant/seed.sql` → `scripts/dev-seed-personas.ts`
(see `supabase/multitenant/NEW_PROJECT_SETUP_MT.md`).

- `multitenant/schema.sql` was authored line-by-line from a live dump of community-mt-dev and
  **supersedes** the never-run `PROPOSAL_schema.sql` (which now carries a superseded header).
- `multitenant/seed.sql`: 3 teachers (A=prophet-system, B=movement-bootcamp, C=empty-academy
  [intentionally empty]) + per-teacher channels/topics/content/folders/recordings/events + 5 buckets.
- `scripts/dev-seed-personas.ts`: dev personas + memberships + demo posts via the auth admin API
  (auth users can't be plain-INSERTed). Password `devpass123!`.
- **single-tenant `supabase/bootstrap/schema.sql` + `supabase/seed.sql` are deliberately left
  untouched** — they still reproduce the `main` prod DBs (single-tenant shape: no teacher_id,
  hardcoded 52a53b67 Recordings topic, "Johnson" literal). MT gets its own files; the two paths coexist.

**Verified green (2026-06-24) via cloud-confirm** (local `supabase start` unavailable — no Docker on
the machine): applied the three files to a throwaway Supabase project and diffed all 11 introspection
blocks (columns, constraints incl. composite + deferrable, indexes incl. partial-unique, RLS flags,
public + storage policies, function bodies, trigger, table/column/function-EXECUTE grants, buckets,
extensions) against the live dump → **zero schema deltas**. The only intentional deviations — D4
(trigger call qualified `public.handle_new_user()`) and D6 (storage policies wrapped in
`DROP POLICY IF EXISTS`) — render invisibly at the catalog level. Grants confirmed exact, including
the determinism revokes: `memberships` write-less for authenticated, `profiles` no table UPDATE +
column-UPDATE only on (display_name, bio, avatar_url, social_links), anon zero. Functional RLS
isolation also confirmed via a `set request.jwt.claims` persona simulation (member@ A-only; none@
content-less but sees the teacher directory; dual@ both teachers separated; badmin@ admin scoped to B
not A — INSERT into A denied 42501, into B allowed).

### RESOLVED — delete_my_account() rewritten for MT (2026-06-25)
The dump's gap is closed. The MT rewrite lives in `multitenant/schema.sql` Section 10 and the
standalone hand-run `multitenant/0001_delete_my_account_mt.sql` (identical body, create-or-replace);
the web caller is `app/(app)/profile/actions.ts` + `_components/delete-account-button.tsx`.
- **Admin rule = OPTION A (per-teacher last-admin block).** Deletion is blocked ONLY if it would drop
  some teacher to ZERO active admins (caller is that teacher's LAST active admin). Returns
  `'last_admin'` + a `teachers` array NAMING the blocking teacher(s); a member, or an admin with a
  co-admin everywhere, deletes freely. (Replaces 0007's global `is_admin` block — that column is gone.)
- **Memberships DELETEd explicitly** (the tombstoned profile is KEPT, so the memberships→profiles
  cascade never fires; without this a dead account keeps active memberships and stays
  has_membership/is_teacher_admin = true).
- **Storage** spans every `{teacher_id}/{uid}/...` prefix across avatars + post-images +
  **post-attachments** (post_attachments is MT-era; 0007 missed it). Caller deletes the returned paths
  post-commit via the service-role client, now reading each `.remove()` `{error}` (the resolve-not-throw
  swallow-fix) and surfacing `storage_cleanup_failed`.
- Verified green on the throwaway (4 cases): A non-admin deletion (real-data avatar parse), D
  cross-teacher non-interference, B sole-admin block naming the teacher (nothing destroyed), C orphan
  prevention + negative control proving "last admin" not "any admin".

**~~INTERIM LIMITATION (sole-admin escape hatch)~~ — RESOLVED (2026-07).** There is now an
in-app promote/demote flow: the `set_membership_role` SECURITY DEFINER RPC (schema.sql Section 11,
migration 0007-roles) with a last-active-admin guard, wired to `role-toggle.tsx` on
`/t/[slug]/admin/members/[id]` via `admin/members/actions.ts`. So a sole admin CAN now get to
deletable in-app: promote a co-admin, then delete. The old "must edit memberships.role in Supabase
first" workaround is no longer required.

### CORRECTION — SEVEN dev personas, not six
Live has `bmember@dev.test` (a B-only member, the B-side analogue of `member@` for A) beyond the
originally documented six. `badmin@` display_name = "Cross admin", `bmember@` = "B member" (set via
metadata); the rest use the `handle_new_user` email-split. All seven password `devpass123!`. Full
mapping in `NEW_PROJECT_SETUP_MT.md`.