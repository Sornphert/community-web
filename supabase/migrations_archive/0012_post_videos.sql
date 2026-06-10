-- Post Videos (Bunny Stream)
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Adds ONE optional Bunny Stream video to a community post (WEB). Admin-only.
-- Mirrors classroom_recordings' video_* columns and the post_images /
-- post_attachments child-table + RLS pattern.
--
-- post_videos references ONLY public.posts(id) (no profiles FK), so it does NOT
-- introduce PostgREST relationship ambiguity for the existing
-- author:profiles!author_id / user:profiles!user_id embeds. The new
-- video:post_videos(*) embed is a plain to-one (UNIQUE post_id), like
-- images:post_images(*).
--
-- One video per post is enforced by UNIQUE (post_id). The video_* columns are
-- written/flipped exactly like classroom_recordings: 'pending' on attach,
-- 'processing' once the upload starts, 'ready' (+ duration + thumbnail) once the
-- Bunny webhook fires. The webhook uses the service-role client, which bypasses
-- RLS, so the admin-only UPDATE policy below never blocks the status flip.

-- ---------------------------------------------------------------------------
-- post_videos
--   One row per post (UNIQUE post_id). Deleting the post cascades the row.
--   video_status: 'pending' | 'processing' | 'ready' | 'failed'.
-- ---------------------------------------------------------------------------

create table if not exists public.post_videos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique references public.posts(id) on delete cascade,
  video_provider text,                  -- 'bunny'
  video_id text,                        -- Bunny video GUID
  video_status text default 'pending',  -- 'pending' | 'processing' | 'ready' | 'failed'
  video_duration_seconds int,
  video_thumbnail_url text,
  created_at timestamptz default now()
);

create index if not exists post_videos_post_id_idx on public.post_videos(post_id);
create index if not exists post_videos_video_id_idx on public.post_videos(video_id);

-- ---------------------------------------------------------------------------
-- post_videos RLS
--   SELECT: any authenticated member (videos visible to all).
--   INSERT / UPDATE / DELETE: admins only (profiles.is_admin = true) AND the
--   caller must own the parent post. Mirrors the is_admin pattern on
--   classroom_recordings, scoped additionally to the parent post's author.
-- ---------------------------------------------------------------------------

alter table public.post_videos enable row level security;

drop policy if exists "post_videos_select" on public.post_videos;
create policy "post_videos_select"
  on public.post_videos for select to authenticated
  using (true);

drop policy if exists "post_videos_insert_admin_own" on public.post_videos;
create policy "post_videos_insert_admin_own"
  on public.post_videos for insert to authenticated
  with check (
    auth.uid() = (select author_id from public.posts where id = post_id)
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "post_videos_update_admin_own" on public.post_videos;
create policy "post_videos_update_admin_own"
  on public.post_videos for update to authenticated
  using (
    auth.uid() = (select author_id from public.posts where id = post_id)
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = (select author_id from public.posts where id = post_id)
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "post_videos_delete_admin_own" on public.post_videos;
create policy "post_videos_delete_admin_own"
  on public.post_videos for delete to authenticated
  using (
    auth.uid() = (select author_id from public.posts where id = post_id)
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.is_admin = true)
  );

-- ---------------------------------------------------------------------------
-- GRANTs
--   A fresh Supabase project can ship without the default table privileges that
--   PostgREST relies on, so grant them explicitly. RLS above is still the real
--   authorization layer; these grants only make the table reachable by the API
--   roles (anon / authenticated / service_role).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.post_videos
  to anon, authenticated, service_role;
