-- =============================================================================
-- 0005_newsletter.sql — category-based homepage newsletter (newsletter_items)
-- =============================================================================
-- Additive, MT-only. Standalone, hand-run in the Supabase SQL editor on
-- community-mt-dev (no CLI migration tooling). Safe to re-run: every object is
-- guarded (create table if not exists / pg_constraint existence check for each FK
-- / drop policy if exists).
--
--   • newsletter_items — a running, newest-first feed of curated links, grouped by
--     category on the public /home homepage. Each row is authored by a teacher-admin
--     from within their own admin hub; teacher_id + category_id are derived server-side
--     from that teacher (never client-chosen), so an item's category is IMPLIED by its
--     teacher. teacher_id → teachers(id); category_id → categories(id); created_by →
--     profiles(id) for "added by" attribution.
--   • RLS — READ IS PUBLIC (anon + authenticated, using true): this is public
--     directory-style content, no member gating, no cross-tenant read hazard. WRITE is
--     the sensitive surface: an admin may INSERT/UPDATE/DELETE only when they are an
--     admin of the item's teacher AND the item's category equals that teacher's own
--     category. The two-part rule is expressed inline (is_teacher_admin(teacher_id) plus
--     a category-match subquery on teachers) — mirroring the post_videos cross-table
--     subquery precedent; NO helper function.
--   • grants — full CRUD to authenticated (RLS is the gate, like every content table);
--     anon column-scoped SELECT; service_role full.
--
-- NOTE — category_id is NOT NULL + ON DELETE CASCADE, which DIVERGES from
-- teachers.category_id (nullable, ON DELETE SET NULL). Rationale: every newsletter item
-- must live in a category (the feed is grouped by it and the write rule requires a
-- match), so NULL is meaningless here; and a NOT NULL column cannot be SET NULL when its
-- category is deleted, so the item must go with it (CASCADE). Deleting a category is a
-- rare platform-admin action; this is a safety net, not a hot path. A teacher whose
-- category_id is NULL (e.g. empty-academy) therefore cannot write ANY item: the
-- category-match subquery yields NULL, and `category_id = NULL` is never true, so RLS
-- denies the write (SQL three-valued logic does the work — no special-casing).
-- =============================================================================


-- =============================================================================
-- A — newsletter_items table (carries teacher_id; no child tables, so no composite
--     same-teacher unique key is needed)
-- =============================================================================
create table if not exists public.newsletter_items (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    category_id uuid not null,
    created_by  uuid,
    url         text not null,
    headline    text not null,
    blurb       text,
    created_at  timestamptz default now(),
    constraint newsletter_items_pkey primary key (id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'newsletter_items_teacher_id_fkey') then
    alter table public.newsletter_items
      add constraint newsletter_items_teacher_id_fkey
      foreign key (teacher_id) references public.teachers(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'newsletter_items_category_id_fkey') then
    alter table public.newsletter_items
      add constraint newsletter_items_category_id_fkey
      foreign key (category_id) references public.categories(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'newsletter_items_created_by_fkey') then
    alter table public.newsletter_items
      add constraint newsletter_items_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists newsletter_items_category_created_idx
  on public.newsletter_items (category_id, created_at desc);
create index if not exists newsletter_items_teacher_idx
  on public.newsletter_items (teacher_id);

alter table public.newsletter_items enable row level security;


-- =============================================================================
-- B — RLS: PUBLIC read (anon + authenticated); two-part admin write rule
-- =============================================================================
-- READ = public.
drop policy if exists newsletter_items_select_all on public.newsletter_items;
create policy newsletter_items_select_all on public.newsletter_items for select to authenticated using (true);
drop policy if exists newsletter_items_select_anon on public.newsletter_items;
create policy newsletter_items_select_anon on public.newsletter_items for select to anon using (true);

-- WRITE = admin of the item's teacher AND item.category_id == that teacher's category_id.
-- Inline subquery reads public.teachers (open to authenticated via teachers_select_all),
-- so no SECURITY DEFINER helper is needed — mirrors the post_videos cross-table subquery.
drop policy if exists newsletter_items_insert_admin on public.newsletter_items;
create policy newsletter_items_insert_admin on public.newsletter_items for insert to authenticated
  with check (
    is_teacher_admin(teacher_id)
    and category_id = (select t.category_id from public.teachers t where t.id = newsletter_items.teacher_id)
  );

-- UPDATE: USING scopes to the admin's own teacher's rows ONLY (no category match — a row
-- whose stored category drifted from the teacher's current category must stay editable);
-- WITH CHECK re-applies the full two-part rule so a row can't be moved to another teacher
-- or a mismatched category.
drop policy if exists newsletter_items_update_admin on public.newsletter_items;
create policy newsletter_items_update_admin on public.newsletter_items for update to authenticated
  using (is_teacher_admin(teacher_id))
  with check (
    is_teacher_admin(teacher_id)
    and category_id = (select t.category_id from public.teachers t where t.id = newsletter_items.teacher_id)
  );

-- DELETE: is_teacher_admin on the existing row's teacher_id ONLY (category match NOT
-- required to delete your own teacher's item).
drop policy if exists newsletter_items_delete_admin on public.newsletter_items;
create policy newsletter_items_delete_admin on public.newsletter_items for delete to authenticated
  using (is_teacher_admin(teacher_id));


-- =============================================================================
-- C — grants: authenticated full CRUD (RLS is the gate); anon column-scoped SELECT;
--     service_role full.
-- =============================================================================
grant select, insert, update, delete, truncate, references, trigger
  on public.newsletter_items to authenticated;

-- anon read: the display columns for the public feed. created_at is INTENTIONALLY
-- INCLUDED here (unlike the teachers/categories anon grants, which exclude it) because
-- the newsletter is a newest-first feed and the date is a display field.
grant select (id, category_id, teacher_id, url, headline, blurb, created_at)
  on public.newsletter_items to anon;

grant all on public.newsletter_items to service_role;


-- =============================================================================
-- End of 0005. Run ONCE in the SQL editor on community-mt-dev.
-- =============================================================================
