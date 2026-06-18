-- 0014_weekly_months.sql
-- Two-level Johnson Weekly: month groups (week_groups) contain week channels.
-- Run in the Supabase SQL editor on BOTH projects (Johnson + Bootcamp) BEFORE
-- deploying app code. Idempotent / single-transaction-safe (re-runnable in full).
--
-- A "week" is a channels row (section='weekly', post_permission='admin_only',
-- group_id -> its month). A "month" is a week_groups row. week_number is the
-- per-month sort key; channels.slug is a GLOBAL unique id (independent).
--
-- NO-OP for existing behavior: every existing channel stays section='community',
-- group_id NULL; with the getChannels .eq('section','community') filter the
-- Community nav is byte-identical on both instances. Weekly stays hidden behind
-- NEXT_PUBLIC_SHOW_WEEKLY (default off).
--
-- PRECONDITION for the strict channels_weekly_has_group CHECK: no orphan weekly
-- channels (section='weekly' AND group_id IS NULL) may exist, or the constraint
-- fails and the whole script rolls back. Verified zero on both live DBs.

-- 1. week_groups — the "month" container (FLAT; no nesting) -----------------
create table if not exists public.week_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

alter table public.week_groups enable row level security;

drop policy if exists week_groups_select_authenticated on public.week_groups;
create policy week_groups_select_authenticated on public.week_groups
  for select to authenticated using (true);

drop policy if exists week_groups_insert_admin on public.week_groups;
create policy week_groups_insert_admin on public.week_groups
  for insert to authenticated
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.is_admin = true));

drop policy if exists week_groups_update_admin on public.week_groups;
create policy week_groups_update_admin on public.week_groups
  for update to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p
                      where p.id = auth.uid() and p.is_admin = true));

drop policy if exists week_groups_delete_admin on public.week_groups;
create policy week_groups_delete_admin on public.week_groups
  for delete to authenticated
  using (exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.is_admin = true));

grant select, insert, update, delete on public.week_groups
  to anon, authenticated, service_role;

create index if not exists week_groups_position_idx
  on public.week_groups (position desc);

-- 2. channels: section + week_number + group_id ----------------------------
alter table public.channels
  add column if not exists section text not null default 'community';
alter table public.channels
  add column if not exists week_number integer;
-- group_id ON DELETE NO ACTION (restrict): a month can't be deleted while it
-- still has weeks (month-delete UI is phase-2 anyway).
alter table public.channels
  add column if not exists group_id uuid references public.week_groups(id);

-- section CHECK (ADD CONSTRAINT has no IF NOT EXISTS -> catalog guard).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channels_section_check') then
    alter table public.channels
      add constraint channels_section_check check (section in ('community','weekly'));
  end if;
end $$;

-- STRICT: every weekly channel belongs to a month; community channels: null.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channels_weekly_has_group') then
    alter table public.channels
      add constraint channels_weekly_has_group
      check (section <> 'weekly' or group_id is not null);
  end if;
end $$;

-- 3. index: section filter + per-month week ordering -----------------------
drop index if exists channels_section_week_idx;  -- superseded by the composite
create index if not exists channels_section_group_week_idx
  on public.channels (section, group_id, week_number desc);
