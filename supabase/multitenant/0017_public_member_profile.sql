-- =====================================================================
-- 0017_public_member_profile.sql
--
-- Public author profiles reachable from the homepage public feed (/u/[teacher]/[id]).
-- Anonymous + logged-in-non-member visitors can view an author's PUBLIC posts and
-- profile header. This adds NO new authenticated read path — everything here is
-- SECURITY DEFINER and anon-granted, and the ONLY posts it exposes are the same
-- ones public_posts_feed already exposes (is_public AND NOT hidden_from_public AND
-- author not tombstoned). Private/community-only posts remain unreachable.
--
-- Two changes:
--   (A) public_posts_feed gains an author_id RETURN column (so a feed card can link
--       to its author) and an optional p_author_id FILTER param (so the profile page
--       can page one author's public posts through the SAME predicate — single
--       source of truth for "what is a public post"). Changing the RETURNS shape
--       forces DROP + CREATE; grants are re-applied.
--   (B) public_member_header(p_teacher_id, p_author_id): one-row profile header
--       (name, avatar, bio, social_links, role, teacher) for an ACTIVE, non-
--       tombstoned member of that teacher. Empty result => the page 404s. Mirrors
--       getMemberProfile's active-membership gate. Exposes bio + social_links
--       publicly by product decision (previously co-member-only).
--
-- Standalone, hand-run in the Supabase SQL editor, then reconciled into
-- supabase/multitenant/schema.sql. Idempotent: re-run the whole script on any error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (A) public_posts_feed — add author_id column + p_author_id filter.
--     RETURNS shape changes, so DROP the old 3-arg signature first. The old
--     grants vanish with it and are re-issued at the bottom.
-- ---------------------------------------------------------------------
drop function if exists public.public_posts_feed(int, int, uuid);

create or replace function public.public_posts_feed(
  p_limit      int,
  p_offset     int,
  p_teacher_id uuid default null,
  p_author_id  uuid default null
)
returns table (
  author_id    uuid,
  display_name text,
  avatar_url   text,
  body         text,
  image_path   text,
  like_count   bigint,
  teacher_slug text,
  teacher_name text,
  featured     boolean,
  created_at   timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    p.author_id,
    pr.display_name,
    pr.avatar_url,
    p.body,
    (select pi.storage_path
       from public.post_images pi
      where pi.post_id = p.id
      order by pi."position" asc
      limit 1)                                              as image_path,
    (select count(*)
       from public.post_likes pl
      where pl.post_id = p.id)                              as like_count,
    t.slug                                                  as teacher_slug,
    t.name                                                  as teacher_name,
    p.featured,
    p.created_at
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.teachers t  on t.id  = p.teacher_id
  where p.is_public
    and not p.hidden_from_public
    and pr.deleted_at is null
    and (p_teacher_id is null or p.teacher_id = p_teacher_id)
    and (p_author_id  is null or p.author_id  = p_author_id)
  order by p.featured desc, p.created_at desc
  limit  least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------
-- (B) public_member_header — the profile header for ONE author in ONE teacher.
--     Returns a row only when the author is an ACTIVE, non-tombstoned member of
--     that teacher (mirrors getMemberProfile). No row => page 404s. authz reads
--     through the row filter itself, so a bad (teacher, author) pair leaks nothing.
-- ---------------------------------------------------------------------
create or replace function public.public_member_header(
  p_teacher_id uuid,
  p_author_id  uuid
)
returns table (
  display_name text,
  avatar_url   text,
  bio          text,
  social_links jsonb,
  role         text,
  teacher_slug text,
  teacher_name text
)
language sql stable security definer set search_path to 'public'
as $$
  select
    pr.display_name,
    pr.avatar_url,
    pr.bio,
    pr.social_links,
    m.role,
    t.slug as teacher_slug,
    t.name as teacher_name
  from public.memberships m
  join public.profiles pr on pr.id = m.profile_id
  join public.teachers  t on t.id  = m.teacher_id
  where m.teacher_id = p_teacher_id
    and m.profile_id = p_author_id
    and m.status = 'active'
    and pr.deleted_at is null
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- (C) Grants — re-issue for the recreated feed fn (both anon + authenticated,
--     matching its prior grant) and grant the new header fn to the same roles.
-- ---------------------------------------------------------------------
grant execute on function public.public_posts_feed(int, int, uuid, uuid) to anon, authenticated;
grant execute on function public.public_member_header(uuid, uuid)        to anon, authenticated;
