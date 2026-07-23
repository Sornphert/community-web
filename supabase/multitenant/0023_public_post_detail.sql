-- =====================================================================
-- 0023_public_post_detail.sql
--
-- Makes public posts openable (a lead-gen funnel: anon teaser → member full view).
--   (A) public_posts_feed now returns post_id, so a feed card can link to /p/[id].
--       The id is only ever a PUBLIC post's id (the WHERE is unchanged), so exposing
--       it leaks nothing — /p/[id] re-checks publicness through public_post() below.
--   (B) public_post(p_post_id): the single-post read for /p/[id]. SECURITY DEFINER,
--       anon-granted, returns a post ONLY if it is public + not hidden + author not
--       tombstoned — identical gate to the feed. It returns comment_count (a NUMBER,
--       never comment text — comments stay members-only, read AND write, unchanged),
--       plus teacher_slug + channel_slug so the page can redirect a MEMBER to the real
--       in-app post. No RLS is loosened anywhere by this migration.
--
-- (A) is a DROP + CREATE (RETURN shape changes); grant re-applied.
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

drop function if exists public.public_posts_feed(int, int, uuid, uuid, text);

create or replace function public.public_posts_feed(
  p_limit        int,
  p_offset       int,
  p_teacher_id   uuid default null,
  p_author_id    uuid default null,
  p_category_slug text default null
)
returns table (
  post_id      uuid,
  author_id    uuid,
  display_name text,
  avatar_url   text,
  body         text,
  image_url    text,
  like_count   bigint,
  teacher_slug text,
  teacher_name text,
  featured     boolean,
  created_at   timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    p.id                                                    as post_id,
    p.author_id,
    pr.display_name,
    pr.avatar_url,
    p.body,
    (select pi.url
       from public.post_images pi
      where pi.post_id = p.id
      order by pi."position" asc
      limit 1)                                              as image_url,
    (select count(*)
       from public.post_likes pl
      where pl.post_id = p.id)                              as like_count,
    t.slug                                                  as teacher_slug,
    t.name                                                  as teacher_name,
    p.featured,
    p.created_at
  from public.posts p
  join public.profiles pr  on pr.id  = p.author_id
  join public.teachers t   on t.id   = p.teacher_id
  left join public.categories cat on cat.id = t.category_id
  where p.is_public
    and not p.hidden_from_public
    and pr.deleted_at is null
    and (p_teacher_id    is null or p.teacher_id = p_teacher_id)
    and (p_author_id     is null or p.author_id  = p_author_id)
    and (p_category_slug is null or cat.slug     = p_category_slug)
  order by p.featured desc, p.created_at desc
  limit  least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Single public post for /p/[id]. Same public gate as the feed. comment_count is a
-- COUNT only — no comment text crosses this boundary (comments are members-only).
create or replace function public.public_post(p_post_id uuid)
returns table (
  post_id       uuid,
  author_id     uuid,
  display_name  text,
  avatar_url    text,
  title         text,
  body          text,
  image_url     text,
  like_count    bigint,
  comment_count bigint,
  teacher_slug  text,
  teacher_name  text,
  channel_slug  text,
  featured      boolean,
  created_at    timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    p.id as post_id,
    p.author_id,
    pr.display_name,
    pr.avatar_url,
    p.title,
    p.body,
    (select pi.url from public.post_images pi
      where pi.post_id = p.id order by pi."position" asc limit 1) as image_url,
    (select count(*) from public.post_likes pl where pl.post_id = p.id) as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)     as comment_count,
    t.slug as teacher_slug,
    t.name as teacher_name,
    ch.slug as channel_slug,
    p.featured,
    p.created_at
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.teachers t  on t.id  = p.teacher_id
  left join public.channels ch on ch.id = p.channel_id
  where p.id = p_post_id
    and p.is_public
    and not p.hidden_from_public
    and pr.deleted_at is null
  limit 1;
$$;

grant execute on function public.public_posts_feed(int, int, uuid, uuid, text) to anon, authenticated;
grant execute on function public.public_post(uuid) to anon, authenticated;
