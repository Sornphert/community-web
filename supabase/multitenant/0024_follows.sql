-- =====================================================================
-- 0024_follows.sql
-- Platform-wide social graph: user A follows user B. Powers follower/
-- following COUNTS + LISTS on profiles and a "Following" feed of posts by
-- the people you follow.
--
-- PLATFORM-WIDE (not teacher-scoped): a follow is a relationship between two
-- profiles, independent of any community. Any authenticated user may follow
-- any (non-tombstoned) profile, and the graph is readable by any signed-in
-- user (needed so counts/lists render for everyone). This is deliberate per
-- product — the follow graph is treated as non-sensitive social proof.
--
-- Note the FOLLOWING FEED does NOT bypass tenancy: it reuses the posts RLS,
-- so you still only see a followed user's posts in communities YOU are a
-- member of. Follows are broad; post visibility stays membership-gated.
--
-- TOMBSTONES: follows.follower_id / following_id FK profiles ON DELETE
-- CASCADE, but delete_my_account TOMBSTONES the profile (keeps the row), so
-- the cascade never fires and a deleted user's follow rows persist. That is
-- intentional and needs NO change to delete_my_account: every follow READ
-- (counts + lists) joins profiles and filters `deleted_at is null`, so a
-- tombstoned user is never shown or counted — exactly how the members list
-- already excludes tombstoned users. The orphaned rows are invisible and
-- get cleaned only if the profile is ever hard-deleted.
--
-- Standalone, hand-run in the Supabase SQL editor (no CLI migration tooling
-- in this repo), then reconciled into supabase/multitenant/schema.sql.
-- Idempotent: re-run the whole script on any error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Table
-- ---------------------------------------------------------------------
create table if not exists public.follows (
    follower_id  uuid not null,
    following_id uuid not null,
    created_at   timestamptz not null default now(),
    constraint follows_pkey primary key (follower_id, following_id),
    -- Can't follow yourself.
    constraint follows_no_self check (follower_id <> following_id),
    constraint follows_follower_fkey
      foreign key (follower_id)  references public.profiles(id) on delete cascade,
    constraint follows_following_fkey
      foreign key (following_id) references public.profiles(id) on delete cascade
);

-- PK (follower_id, following_id) already indexes "who does A follow" + the
-- existence check. Add the reverse index for "who follows B" (followers list),
-- and order both directions by recency.
create index if not exists follows_follower_idx
  on public.follows (follower_id, created_at desc);
create index if not exists follows_following_idx
  on public.follows (following_id, created_at desc);

-- ---------------------------------------------------------------------
-- (2) RLS
--   SELECT — any authenticated user (platform-wide counts/lists).
--   INSERT — only as yourself, only a non-tombstoned target, never self
--            (the CHECK constraint also guards self).
--   DELETE — only your own follow (unfollow).
--   No UPDATE (a follow has no mutable state).
-- ---------------------------------------------------------------------
alter table public.follows enable row level security;

drop policy if exists follows_select_all on public.follows;
create policy follows_select_all on public.follows
  for select to authenticated
  using (true);

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
    and exists (
      select 1 from public.profiles p
      where p.id = following_id
        and p.deleted_at is null
    )
  );

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = auth.uid());

-- ---------------------------------------------------------------------
-- (3) Grants — authenticated only; anon has no business in the graph
--     (the follow UI is in-app, behind auth).
-- ---------------------------------------------------------------------
grant select, insert, delete on public.follows to authenticated;
revoke all on public.follows from anon;
