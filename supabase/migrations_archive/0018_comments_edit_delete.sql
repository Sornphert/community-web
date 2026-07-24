-- Comment edit + delete (WEB + future mobile)
-- Run this in the Supabase SQL editor on BOTH projects (Johnson + Bootcamp)
-- BEFORE deploying the app code. There is no CLI migration tooling in this repo.
-- Idempotent: safe to re-run. Mirrors 0013 (posts edit/delete).
--
-- Two changes:
--   1. comments.edited_at — nullable timestamptz, set by the updateComment server
--      action. NULL = never edited, so existing comments are unchanged and the
--      "(edited)" indicator stays hidden for them.
--   2. DELETE = author OR admin (moderation), so an admin can remove any comment
--      (e.g. a wrong one posted by someone else). EDIT stays author-only — editing
--      another person's words is not allowed even for admins.
--
-- Like posts, the updateComment / deleteComment server actions run through the
-- service-role client (bypasses RLS), so admin actions work uniformly; the RLS
-- below is the second layer / covers future client + mobile paths.

-- ---------------------------------------------------------------------------
-- 1. edited_at
-- ---------------------------------------------------------------------------

alter table public.comments add column if not exists edited_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. DELETE = author OR admin  (UPDATE stays author-only)
--    Admin check mirrors the profiles.is_admin EXISTS pattern from 0013.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can delete their own comments" on public.comments;
drop policy if exists comments_delete_owner_or_admin on public.comments;

create policy comments_delete_owner_or_admin on public.comments
  for delete to authenticated
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.is_admin = true)
  );

-- ---------------------------------------------------------------------------
-- GRANTs (idempotent).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.comments
  to anon, authenticated, service_role;
