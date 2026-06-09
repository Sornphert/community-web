-- Classroom Recordings (Stage 1)
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Adds an admin-curated, nested folder tree of video recordings to the Classroom.
--
-- Stage 1 is schema + browsing + admin CRUD only. Video upload (Bunny Stream)
-- arrives in Stage 2, so the video_* columns exist but stay null/'pending' for now.
--
-- created_by references auth.users(id) (NOT profiles) — these rows are authored by
-- admins via server actions and we only ever need the raw uid for auditing, never
-- an embedded profile, so there is no PostgREST embed-ambiguity concern here.

-- ---------------------------------------------------------------------------
-- classroom_folders
--   Self-referential tree via parent_folder_id (NULL => top-level folder).
--   Deleting a folder cascades to its subfolders and recordings.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_folder_id uuid references public.classroom_folders(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

create index if not exists classroom_folders_parent_folder_id_idx
  on public.classroom_folders(parent_folder_id);

-- ---------------------------------------------------------------------------
-- classroom_recordings
--   Belongs to a folder; deleting the folder cascades to its recordings.
--   video_status: 'pending' | 'processing' | 'ready' | 'failed' (Stage 2).
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_recordings (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.classroom_folders(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  video_provider text,                  -- nullable for now; 'bunny' once Stage 2
  video_id text,                        -- nullable for now (Bunny video GUID)
  video_status text default 'pending',  -- 'pending' | 'processing' | 'ready' | 'failed'
  video_duration_seconds int,
  video_thumbnail_url text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

create index if not exists classroom_recordings_folder_id_idx
  on public.classroom_recordings(folder_id);
create index if not exists classroom_recordings_video_id_idx
  on public.classroom_recordings(video_id);

-- ---------------------------------------------------------------------------
-- classroom_folders RLS
--   SELECT: any authenticated user
--   INSERT / UPDATE / DELETE: admins only (profiles.is_admin = true)
-- ---------------------------------------------------------------------------

alter table public.classroom_folders enable row level security;

drop policy if exists "classroom_folders_select_authenticated" on public.classroom_folders;
create policy "classroom_folders_select_authenticated"
  on public.classroom_folders
  for select
  to authenticated
  using (true);

drop policy if exists "classroom_folders_insert_admin" on public.classroom_folders;
create policy "classroom_folders_insert_admin"
  on public.classroom_folders
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

drop policy if exists "classroom_folders_update_admin" on public.classroom_folders;
create policy "classroom_folders_update_admin"
  on public.classroom_folders
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

drop policy if exists "classroom_folders_delete_admin" on public.classroom_folders;
create policy "classroom_folders_delete_admin"
  on public.classroom_folders
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- ---------------------------------------------------------------------------
-- classroom_recordings RLS (mirrors classroom_folders)
-- ---------------------------------------------------------------------------

alter table public.classroom_recordings enable row level security;

drop policy if exists "classroom_recordings_select_authenticated" on public.classroom_recordings;
create policy "classroom_recordings_select_authenticated"
  on public.classroom_recordings
  for select
  to authenticated
  using (true);

drop policy if exists "classroom_recordings_insert_admin" on public.classroom_recordings;
create policy "classroom_recordings_insert_admin"
  on public.classroom_recordings
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

drop policy if exists "classroom_recordings_update_admin" on public.classroom_recordings;
create policy "classroom_recordings_update_admin"
  on public.classroom_recordings
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

drop policy if exists "classroom_recordings_delete_admin" on public.classroom_recordings;
create policy "classroom_recordings_delete_admin"
  on public.classroom_recordings
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.is_admin = true
    )
  );

-- ---------------------------------------------------------------------------
-- Seed (fixed UUIDs so they are stable to reference; created_by left null).
--   Foundations (0)
--     ├─ Introduction (recording, 0)
--     └─ Getting Started (subfolder, 1)
--          └─ Setting Up Your Account (recording, 0)
--   Market Analysis (1)
--     └─ Reading the Charts (recording, 0)
-- ---------------------------------------------------------------------------

insert into public.classroom_folders (id, name, parent_folder_id, position) values
  ('f0000000-0000-0000-0000-000000000001', 'Foundations',     null,                                     0),
  ('f0000000-0000-0000-0000-000000000002', 'Getting Started', 'f0000000-0000-0000-0000-000000000001',   1),
  ('f0000000-0000-0000-0000-000000000003', 'Market Analysis', null,                                     1)
on conflict (id) do nothing;

insert into public.classroom_recordings (id, folder_id, title, description, position) values
  ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Introduction',             'Welcome to the recordings library. Start here.', 0),
  ('a0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Setting Up Your Account',  'How to get your account ready before the first session.', 0),
  ('a0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'Reading the Charts',       'A first look at reading the charts together.', 0)
on conflict (id) do nothing;
