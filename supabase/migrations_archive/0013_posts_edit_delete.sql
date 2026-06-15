-- Post edit + delete (WEB + future mobile)
-- Run this in the Supabase SQL editor on BOTH projects (Johnson + Bootcamp)
-- BEFORE deploying the app code. There is no CLI migration tooling in this repo.
-- Idempotent: safe to re-run.
--
-- Two changes:
--   1. posts.edited_at — nullable timestamptz, set by the updatePost server
--      action. NULL = never edited, so every existing post is unchanged and the
--      "(edited)" indicator stays hidden for them.
--   2. Replace the posts UPDATE/DELETE policies so BOTH the author AND admins can
--      edit/delete. The old policies were asymmetric and permissive:
--        - posts_update_admin               -> admin-only UPDATE
--        - "Users can delete their own posts" -> author-only DELETE
--      Postgres ORs permissive policies, so a new policy would NOT override an
--      old one — the old two MUST be dropped first, or admins could still only
--      update (not author) and authors could still only delete (not admin).
--
-- The INSERT policy (posts_insert_channel_permitted) is intentionally left as-is
-- so channel post-permission gating still applies on create. Channel is not
-- editable, so UPDATE does not need to re-check it.
--
-- NOTE: no storage / post_videos policy changes. The updatePost / deletePost
-- server actions run row + storage + Bunny cleanup via the service-role client
-- (bypasses RLS), so an admin can edit another member's post uniformly. New
-- image/PDF uploads in edit mode use the UPLOADER's own UID as the path prefix,
-- so the existing own-folder storage INSERT policy already covers admins.

-- ---------------------------------------------------------------------------
-- 1. edited_at
-- ---------------------------------------------------------------------------

alter table public.posts add column if not exists edited_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. UPDATE / DELETE = author OR admin
--    Admin check mirrors the existing profiles.is_admin EXISTS pattern used
--    across posts/topics/content_items/events/classroom_recordings.
-- ---------------------------------------------------------------------------

drop policy if exists posts_update_admin on public.posts;
drop policy if exists "Users can delete their own posts" on public.posts;
drop policy if exists posts_update_owner_or_admin on public.posts;
drop policy if exists posts_delete_owner_or_admin on public.posts;

create policy posts_update_owner_or_admin on public.posts
  for update to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.is_admin = true)
  );

create policy posts_delete_owner_or_admin on public.posts
  for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.is_admin = true)
  );

-- ---------------------------------------------------------------------------
-- GRANTs (idempotent; base posts table predates the explicit-grant convention).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.posts
  to anon, authenticated, service_role;
