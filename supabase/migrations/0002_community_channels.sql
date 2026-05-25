-- Community Channels
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Splits the single Community feed into three channels and gates posting per channel.
--
-- After running this, existing posts keep channel_id = NULL. Assign each one a
-- channel via the /admin/migrate-posts UI, then run 0003 to make the column NOT NULL.

-- ---------------------------------------------------------------------------
-- Channels table
-- ---------------------------------------------------------------------------

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                    -- 'announcements' | 'general' | 'testimonies'
  name text not null,                           -- display name
  description text,
  position int not null default 0,
  post_permission text not null default 'all'   -- 'all' | 'admin_only'
    check (post_permission in ('all', 'admin_only')),
  created_at timestamptz default now()
);

create index if not exists channels_position_idx on public.channels(position);

-- ---------------------------------------------------------------------------
-- Channels RLS
--   SELECT: any authenticated user
--   INSERT / UPDATE / DELETE: admins only (profiles.is_admin = true)
-- ---------------------------------------------------------------------------

alter table public.channels enable row level security;

drop policy if exists "channels_select_authenticated" on public.channels;
create policy "channels_select_authenticated"
  on public.channels
  for select
  to authenticated
  using (true);

drop policy if exists "channels_insert_admin" on public.channels;
create policy "channels_insert_admin"
  on public.channels
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

drop policy if exists "channels_update_admin" on public.channels;
create policy "channels_update_admin"
  on public.channels
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

drop policy if exists "channels_delete_admin" on public.channels;
create policy "channels_delete_admin"
  on public.channels
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- ---------------------------------------------------------------------------
-- Seed the three channels (fixed UUIDs so they are stable to reference)
-- ---------------------------------------------------------------------------

insert into public.channels (id, slug, name, description, position, post_permission) values
  ('c0000000-0000-0000-0000-000000000001', 'announcements', 'Announcements', 'Official updates from Johnson. Admins post here.', 0, 'admin_only'),
  ('c0000000-0000-0000-0000-000000000002', 'general',       'General',       'Open discussion for everyone.', 1, 'all'),
  ('c0000000-0000-0000-0000-000000000003', 'testimonies',   'Testimonies',   'Share your wins and results.', 2, 'all')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- posts.channel_id (nullable for now; 0003 makes it NOT NULL after migration)
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists channel_id uuid references public.channels(id);

create index if not exists posts_channel_id_idx on public.posts(channel_id);

-- ---------------------------------------------------------------------------
-- posts INSERT policy — replace the author-only policy with a channel-aware one.
--
-- IMPORTANT: the original INSERT policy was created outside these migration
-- files, so its name is not known here. Drop YOUR existing posts INSERT policy
-- before creating the new one. Common names are dropped below — if yours differs,
-- check Supabase → Authentication → Policies and drop it too.
-- ---------------------------------------------------------------------------

drop policy if exists "posts_insert_own" on public.posts;
drop policy if exists "Users can insert their own posts" on public.posts;
drop policy if exists "posts_insert_channel_permitted" on public.posts;
create policy "posts_insert_channel_permitted"
  on public.posts
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      exists (
        select 1 from public.channels c
        where c.id = channel_id and c.post_permission = 'all'
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.is_admin = true
      )
    )
  );

-- ---------------------------------------------------------------------------
-- posts UPDATE (admin) — lets admins assign channels to OTHER members' posts
-- in the /admin/migrate-posts UI. Coexists with the existing author-only UPDATE
-- policy (Postgres ORs multiple permissive policies for the same action).
-- ---------------------------------------------------------------------------

drop policy if exists "posts_update_admin" on public.posts;
create policy "posts_update_admin"
  on public.posts
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );
