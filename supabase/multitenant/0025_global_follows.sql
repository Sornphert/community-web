-- =====================================================================
-- 0025_global_follows.sql
-- Make the follow graph TRULY global (follow anyone from anywhere), not just
-- people you share a community with.
--
-- WHY THIS IS NEEDED: profiles RLS (profiles_select_self_or_comember) only lets
-- you SELECT a profile you co-share a community with. That restriction leaked into
-- the 0024 follow-insert policy (its inline `exists (select … from profiles …)`
-- was evaluated under profiles RLS) AND into the follow-list reads (which join
-- profiles), so both were effectively co-member-gated. This migration adds
-- SECURITY DEFINER helpers that bypass profiles RLS to expose the MINIMAL identity
-- the product wants platform-wide (name, avatar, bio, socials) and to gate the
-- follow insert on existence/tombstone only — never on shared membership.
--
-- SCOPE (product decision): any authenticated user may see any user's name, avatar,
-- bio and social links, and their follower/following graph, and may follow them.
-- POSTS are deliberately NOT widened — they stay gated by the posts RLS, so you
-- only ever see a user's posts in communities you both belong to.
--
-- Standalone, hand-run in the Supabase SQL editor, then reconciled into
-- supabase/multitenant/schema.sql. Idempotent: re-run on any error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) profile_is_active — existence + not-tombstoned, RLS-bypassing.
--     Used by the follow-insert policy so you can follow ANY live user.
-- ---------------------------------------------------------------------
create or replace function public.profile_is_active(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user and deleted_at is null
  );
$$;
grant execute on function public.profile_is_active(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (2) Replace the 0024 follow-insert policy: gate on self + existence/
--     tombstone ONLY (via the definer helper), never on co-membership.
-- ---------------------------------------------------------------------
drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
    and public.profile_is_active(following_id)
  );

-- ---------------------------------------------------------------------
-- (3) user_card — the minimal global profile for ANY live user:
--     name, avatar, bio, socials. RLS-bypassing so it works cross-tenant.
--     (Posts are NOT here — they stay community-gated via posts RLS.)
-- ---------------------------------------------------------------------
create or replace function public.user_card(p_user uuid)
returns table (
  id           uuid,
  display_name text,
  avatar_url   text,
  bio          text,
  social_links jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.display_name, p.avatar_url, p.bio, p.social_links
  from public.profiles p
  where p.id = p_user and p.deleted_at is null;
$$;
grant execute on function public.user_card(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (4) get_followers / get_following — the follow graph WITH identity,
--     tombstoned users excluded, newest first. RLS-bypassing so lists are
--     complete regardless of shared membership.
-- ---------------------------------------------------------------------
create or replace function public.get_followers(p_profile uuid)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  created_at   timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select f.follower_id, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_profile
    and p.deleted_at is null
  order by f.created_at desc;
$$;
grant execute on function public.get_followers(uuid) to authenticated;

create or replace function public.get_following(p_profile uuid)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  created_at   timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select f.following_id, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_profile
    and p.deleted_at is null
  order by f.created_at desc;
$$;
grant execute on function public.get_following(uuid) to authenticated;
