# New Project Setup — community-web (second teacher)

How to stand up the app in a **fresh Supabase project** (separate teacher,
domain, and Bunny library) from the shared codebase. Single source of truth for
everything that is dashboard-only and has no repo source.

> **Run order, fresh project:** `bootstrap/schema.sql` → `seed.sql`.
> **Never** run `migrations_archive/0002-0011` — those are prod history and are
> already baked into `bootstrap/schema.sql`. See `migrations_archive/_ARCHIVE_README.md`.

---

## 0. One-time: produce the canonical schema (only needed when refreshing the snapshot)

`bootstrap/schema.sql` is assembled by dumping prod. You only redo this if the
snapshot drifts from prod. Commands and cleaning steps are in
[§A — Regenerating the schema snapshot](#a--regenerating-the-schema-snapshot).

---

## 1. Create the Supabase project

- New project in the Supabase dashboard → record the **project ref** and region.
- Get the connection string: Project Settings → Database → Connection string → URI.

## 2. Apply schema + seed

In the SQL Editor (or `psql`):

1. Run `supabase/bootstrap/schema.sql`.
2. Run `supabase/seed.sql`.
3. Confirm the Recordings topic row exists (UUID
   `52a53b67-e2d0-43bf-a2db-38083b8d801d`) — `app/(app)/classroom/page.tsx`
   depends on it.

## 3. Auth — email confirmation (PER-TEACHER DECISION, not a copied default)

Authentication → Sign In / Providers → Email → **Confirm email**.

- **Prod is currently OFF** — that was a *testing* convenience for the first
  teacher, not a recommended production setting.
- A real, paying community almost certainly wants this **ON** so emails are
  verified at signup. Decide deliberately per teacher; do not blindly copy
  prod's OFF.
- The signup action already handles the confirmation flow (`if (!data.session)`
  → redirect to `/login` with a message), so turning it ON is config-only.

## 4. Email — Resend SMTP + sender

(No repo source — all dashboard/registrar config.)

- Create a Resend account/API key for this teacher (free tier: 3000/mo, 100/day).
- Verify the sending domain on the registrar: DNS records (MX + 2 TXT) for the
  `send.<newdomain>` subdomain.
- Supabase → Authentication → SMTP settings:
  - host `smtp.resend.com`, port `587`, username `resend`,
    password = the Resend API key.
  - Sender address `noreply@<newdomain>`, sender name = teacher brand.
- Resend (vs. Supabase built-in SMTP) is required because the built-in is rate
  limited to ~3-4 emails/hour — too low to onboard a cohort.

## 5. Custom domain + redirect URLs

- Point the teacher's domain at Vercel (registrar DNS → Vercel CNAME); Vercel
  auto-provisions SSL (allow 5-30 min).
- Supabase → Authentication → URL Configuration:
  - **Site URL** = the new app URL (e.g. `https://app.<newdomain>`).
  - **Redirect URLs** = login + password-reset callback URLs for the new domain.

## 6. Promote the teacher to admin

`profiles.is_admin` drives all admin gating. After the teacher signs up:

```sql
update public.profiles set is_admin = true where id = '<teacher-auth-uid>';
```

## 7. Bunny Stream (per-teacher library)

- Create a **new Stream library** for this teacher.
- Enable **referrer / allowed-hostnames protection** for the new domain so the
  player can't be embedded elsewhere.
- Create a **webhook** for video status; choose a webhook secret.
- Collect: **Library ID**, **CDN hostname**, **API key**, **webhook secret**.

## 8. Environment variables

Populate in **Vercel** (Project → Settings → Environment Variables) and local
`.env.local`. All of these are teacher-specific:

| Var | Source |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (server-only) |
| `BUNNY_STREAM_LIBRARY_ID` | Bunny library (§7) |
| `BUNNY_STREAM_API_KEY` | Bunny library (§7, server-only) |
| `BUNNY_STREAM_CDN_HOSTNAME` | Bunny library (§7) |
| `BUNNY_STREAM_WEBHOOK_SECRET` | chosen in §7 |

## 9. Hardcoded code constants still pointing at the first teacher

These are **not** env-driven yet. They block a clean second deploy and belong to
the later *parameterization pass* (tracked separately, not part of bootstrap):

- `next.config.ts` — Supabase storage `hostname` is hardcoded
  (`eesyjkmmyiisuaghhota.supabase.co`); remote images 404 until updated.
- `lib/ics.ts` — `DOMAIN = 'app.theprophetsystem.com'` and
  `PRODID:-//The Prophet System//Events//EN`.
- `lib/datetime.ts` — timezone hardcoded `Asia/Kuala_Lumpur` / `+08:00`.
- Brand strings (`Johnson 天命数字投资`) across `app/layout.tsx`,
  `_components/sidebar.tsx`, `login`, `forgot-password`, `reset-password`,
  `community/[channel]/page.tsx`.
- Brand assets `public/brand.jpg`, `public/hero.jpg`, `app/icon.jpg`.
- `app/(app)/classroom/page.tsx` `RECORDINGS_TOPIC_ID` (handled via seed for now;
  refactor to a `topics.is_recordings` boolean during parameterization).

---

## A. Regenerating the schema snapshot

Read-only against prod (ref `eesyjkmmyiisuaghhota`). The CLI is **not currently
installed** and the project is **not linked**.

### A.1 Install + verify (HARD GATE)

```bash
brew install supabase/tap/supabase
supabase --version
supabase login
supabase db dump --help
```

**STOP if `--db-url`, `-f`/`--file`, or `-s`/`--schema` are not present as
expected in `db dump --help`.** Do not improvise or substitute flags — report
the actual help output and resolve before dumping.

### A.2 Dump the public schema (DDL only)

```bash
export PROD_DB_URL='postgresql://postgres:[PASSWORD]@db.eesyjkmmyiisuaghhota.supabase.co:5432/postgres'
supabase db dump --db-url "$PROD_DB_URL" --schema public -f /tmp/public_schema.sql
```

### A.3 Extract storage + auth-trigger objects (run in SQL Editor, read-only)

```sql
-- (i) storage.buckets rows  -> seed.sql
select format(
  'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) '
  'values (%L,%L,%L,%L,%L) on conflict (id) do nothing;',
  id, name, public, file_size_limit, allowed_mime_types
) from storage.buckets order by id;

-- (ii) storage.objects RLS policies  -> bootstrap/schema.sql Section B
select 'create policy '||quote_ident(polname)||' on storage.objects'
  || ' as '||case when polpermissive then 'permissive' else 'restrictive' end
  || ' for '||case polcmd when 'r' then 'select' when 'a' then 'insert'
       when 'w' then 'update' when 'd' then 'delete' when '*' then 'all' end
  || coalesce(' using ('||pg_get_expr(polqual, polrelid)||')','')
  || coalesce(' with check ('||pg_get_expr(polwithcheck, polrelid)||')','')
  || ';'
from pg_policy where polrelid = 'storage.objects'::regclass;

-- (iii) handle_new_user trigger on auth.users  -> bootstrap/schema.sql Section C
select pg_get_triggerdef(oid)||';'
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;
```

### A.4 Clean `/tmp/public_schema.sql` before folding into bootstrap/schema.sql

Strip non-app noise; flag anything ambiguous rather than guessing:

- `supabase_*` / `authenticator` / `service_role` role references and `GRANT`s.
- `ALTER DEFAULT PRIVILEGES`, ownership (`ALTER ... OWNER TO`) lines.
- Extension create/comment noise the new project already has.

### A.5 Verify the dumped `profiles` against prod (one diff check — don't assume)

Confirm the dump reflects the post-`0007` state:

```sql
-- expect NO row (the profiles.id -> auth.users FK was dropped in 0007)
select conname from pg_constraint
where conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass;

-- expect deleted_at present (tombstone column) + is_admin/bio/avatar_url
select column_name from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name in
  ('deleted_at','is_admin','bio','avatar_url');
```

If the dumped `create table public.profiles` still has an `auth.users` FK, the
dump is stale/wrong — reconcile before committing.

---

## Dev personas (community-mt-dev only)

Six auth users provisioned via the auth admin API, all password `devpass123!`:

- `admin@dev.test` — admin of teacher A
- `member@dev.test` — member of A
- `badmin@dev.test` — admin of B, member of A
- `dual@dev.test` — member of A + B
- `none@dev.test` — no memberships
- `revoked@dev.test` — revoked from A

No `DEV_seed.sql` exists — these are **NOT reproducible from the repo**. A fresh dev
DB requires re-creating these six users + their memberships by hand.