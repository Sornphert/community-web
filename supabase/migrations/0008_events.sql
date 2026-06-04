-- Events (v1)
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Admin-curated community events shown on a month calendar. Members read-only.
--
-- Single-tenant: no teacher_slug column (the app has no multi-tenant pattern;
-- scoping is by profiles.is_admin only).
--
-- created_by references auth.users(id) (NOT profiles) — admin-authored via server
-- actions; we never embed a profile off this row, so there is no PostgREST
-- embed-ambiguity concern (cf. classroom_recordings in 0005). ON DELETE SET NULL
-- so deleting an admin's auth row leaves the events in place (authorless).

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  meeting_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists events_starts_at_idx on public.events (starts_at);

alter table public.events enable row level security;

-- SELECT: any authenticated user.
drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_authenticated"
  on public.events
  for select
  to authenticated
  using (true);

-- INSERT: admins only.
drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin"
  on public.events
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- UPDATE: admins only.
drop policy if exists "events_update_admin" on public.events;
create policy "events_update_admin"
  on public.events
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- DELETE: admins only.
drop policy if exists "events_delete_admin" on public.events;
create policy "events_delete_admin"
  on public.events
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );
