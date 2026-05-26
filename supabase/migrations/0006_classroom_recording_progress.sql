-- Classroom Recording Progress
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Per-user completion tracking for the Bunny-powered Classroom Recordings.
-- Mirrors the existing content_progress model: presence of a row == "completed".
--
-- user_id references auth.users(id) (matching content_progress); recording_id
-- references classroom_recordings(id). Composite PK = one row per user/recording.
-- Private, own-rows-only table: each user may read/insert/delete only their own
-- rows. Toggle = insert or delete, so there is no UPDATE policy.

create table if not exists public.classroom_recording_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_id uuid not null references public.classroom_recordings(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, recording_id)
);

create index if not exists classroom_recording_progress_user_id_idx
  on public.classroom_recording_progress(user_id);
create index if not exists classroom_recording_progress_recording_id_idx
  on public.classroom_recording_progress(recording_id);

alter table public.classroom_recording_progress enable row level security;

drop policy if exists "classroom_recording_progress_select_own" on public.classroom_recording_progress;
create policy "classroom_recording_progress_select_own"
  on public.classroom_recording_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "classroom_recording_progress_insert_own" on public.classroom_recording_progress;
create policy "classroom_recording_progress_insert_own"
  on public.classroom_recording_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "classroom_recording_progress_delete_own" on public.classroom_recording_progress;
create policy "classroom_recording_progress_delete_own"
  on public.classroom_recording_progress
  for delete
  to authenticated
  using (auth.uid() = user_id);
