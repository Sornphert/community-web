-- =============================================================================
-- 0004_categories.sql — platform category reference table + teacher FK
-- =============================================================================
-- Foundational, additive, MT-only. Standalone, hand-run in the Supabase SQL editor
-- on community-mt-dev (no CLI migration tooling). Safe to re-run: every object is
-- guarded (create table if not exists / drop policy if exists / add column if not
-- exists / pg_constraint existence check for the FK).
--
--   • categories — platform-controlled public reference table (id, slug unique, name,
--     created_at), managed by SQL/service-role. NO in-app write path.
--   • categories RLS — public read (anon + authenticated, using true). NO write policy;
--     service_role bypasses RLS and manages rows.
--   • grants — read-only to authenticated + anon. anon column grant EXCLUDES created_at,
--     mirroring the teachers anon-grant invariant from 0002.
--   • teachers.category_id — nullable FK REFERENCES categories(id) ON DELETE SET NULL
--     (deleting a category detaches teachers, never nukes them). One category per teacher.
--   • teachers anon column grant extended to include category_id so the public directory
--     can group by category later (harmless now; no anon-facing behavior change yet).
-- =============================================================================


-- =============================================================================
-- A — categories table (public reference data; base table, no outgoing FKs)
-- =============================================================================
create table if not exists public.categories (
    id          uuid not null default gen_random_uuid(),
    slug        text not null,
    name        text not null,
    created_at  timestamptz default now(),
    constraint categories_pkey primary key (id),
    constraint categories_slug_key unique (slug)
);
alter table public.categories enable row level security;


-- =============================================================================
-- B — categories RLS: public read (anon + authenticated). NO write policy.
-- =============================================================================
drop policy if exists categories_select_all on public.categories;
create policy categories_select_all on public.categories for select to authenticated using (true);
drop policy if exists categories_select_anon on public.categories;
create policy categories_select_anon on public.categories for select to anon using (true);


-- =============================================================================
-- C — grants: read-only to both audiences; service_role bypasses RLS (already
--     covered by `grant all ... to service_role`). anon EXCLUDES created_at.
-- =============================================================================
grant select on public.categories to authenticated;
grant select (id, slug, name) on public.categories to anon;


-- =============================================================================
-- D — teachers.category_id: nullable FK, ON DELETE SET NULL (additive, MT-only)
-- =============================================================================
alter table public.teachers add column if not exists category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teachers_category_id_fkey'
  ) then
    alter table public.teachers
      add constraint teachers_category_id_fkey
      foreign key (category_id) references public.categories(id) on delete set null;
  end if;
end $$;


-- =============================================================================
-- E — extend the anon teachers directory grant with category_id (pre-extended so
--     the future directory-grouping fetcher edit can't silently break anon read).
-- =============================================================================
grant select (id, slug, name, cover_url, logo_url, description, category_id)
  on public.teachers to anon;


-- =============================================================================
-- End of 0004. Run ONCE in the SQL editor on community-mt-dev.
-- =============================================================================
