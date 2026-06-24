# New Project Setup — MULTI-TENANT (community-web)

How to stand up a **fresh multi-tenant Supabase project** that reproduces
`community-mt-dev` from repo files. This is the MT counterpart to the single-tenant
`supabase/NEW_PROJECT_SETUP.md` — the two are **separate paths**:

| Target | What to run |
| --- | --- |
| **Single-tenant** (prod: Johnson, Bootcamp; branch `main`) | `bootstrap/schema.sql` → `seed.sql` |
| **Multi-tenant** (branch `phase-2-multitenant`) | `multitenant/schema.sql` → `multitenant/seed.sql` → `scripts/dev-seed-personas.ts` |

Do **not** run the single-tenant `bootstrap/schema.sql` on an MT project, or vice
versa — they are different schema shapes (MT adds `teachers`/`memberships`, `teacher_id`
on every spine table, the `has_membership`/`is_teacher_admin` RPCs, and drops
`profiles.is_admin`).

---

## 1. Create the Supabase project
- New project in the dashboard → record the **project ref** and region.
- Connection string: Project Settings → Database → Connection string → URI.

## 2. Apply schema + content seed
In the SQL Editor (or `psql`), in order:
1. Run `supabase/multitenant/schema.sql`.
2. Run `supabase/multitenant/seed.sql`.

This creates the full MT schema (tables, composite same-teacher FKs, the deferrable
folder self-FK, RLS, the two authz RPCs, storage policies, the `on_auth_user_created`
trigger) and seeds three teachers + per-teacher content:
- **A** = `prophet-system` (The Prophet System)
- **B** = `movement-bootcamp` (Movement Bootcamp)
- **C** = `empty-academy` (Empty Academy) — intentionally **empty** (no members, no
  content) for isolation tests.

## 3. Seed dev personas (auth users + memberships + demo posts)
Auth users can't be plain-INSERTed (hashed passwords live in the `auth` schema), so they
are created via the admin API by a committed script. Point env at the **target** project
(never prod) and run:

```bash
set -a; source .env.local; set +a        # NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npx tsx scripts/dev-seed-personas.ts
```

The script is idempotent (existing users reused by email; memberships + demo posts upsert
on their natural keys).

### Dev personas (community-mt-dev) — SEVEN, all password `devpass123!`

| Email | Display name | Memberships |
| --- | --- | --- |
| `admin@dev.test` | admin | A: admin / active |
| `member@dev.test` | member | A: member / active |
| `dual@dev.test` | dual | A: member / active **and** B: member / active |
| `revoked@dev.test` | revoked | A: member / **revoked** |
| `badmin@dev.test` | **Cross admin** | A: member / active **and** B: **admin** / active |
| `bmember@dev.test` | **B member** | B: member / active |
| `none@dev.test` | none | (none) |

> **Note:** earlier docs described **six** personas. Live community-mt-dev actually has
> **seven** — `bmember@dev.test` (a B-only member, the B-side analogue of `member@` for
> A) was added so B-side isolation isn't tested vacuously. `badmin@` and `bmember@` also
> carry metadata display names ("Cross admin", "B member"); the rest fall back to the
> `handle_new_user` email-split.

## 4. Auth / email / domain / Bunny / env vars
Identical to the single-tenant runbook — see `supabase/NEW_PROJECT_SETUP.md` §3–§9 for
email confirmation, Resend SMTP, custom domain + redirect URLs, Bunny Stream, and the
environment-variable table. (Those steps are dashboard/registrar config with no MT-specific
differences.)

---

## Known gaps / deferred (MT)
- **`delete_my_account()` is ABSENT** on community-mt-dev (dropped out-of-band during the
  MT build, never rewritten). Account deletion is **non-functional** on MT and the schema
  file intentionally omits it. An MT rewrite must decide global-vs-per-teacher deletion,
  gate on `is_teacher_admin` instead of the removed global flag, and enumerate
  `{teacher_id}/{uid}/...` storage paths across every teacher. Tracked in
  `memory/mt-app-group-breaks.md`.
- **content-files bucket is public-read** → a public object URL bypasses RLS and is not
  tenant-isolated (accepted v1 gap; private bucket + signed URLs is the deferred fix).
- **Inter-tenant Bunny video isolation** rests on RLS over the video-id tables +
  unguessable ids (referrer protection no longer isolates between tenants in a unified app).
- **Pre-login teacher branding** needs a public-read surface (deferred to parameterization).

## Reproducing the schema snapshot
`multitenant/schema.sql` is authored line-by-line from a live dump of community-mt-dev
(blocks: table/column DDL, constraints incl. composite + deferrable, indexes, RLS public +
storage, function bodies, the auth trigger, table + column grants, EXECUTE grants, buckets,
extensions). The only intentional deviations from the raw dump are **D4** (trigger call
qualified to `public.handle_new_user()`) and **D6** (storage policies wrapped in
`DROP POLICY IF EXISTS` for re-run safety). A schema diff of a fresh-from-files project
against live should be empty **except** those two.
