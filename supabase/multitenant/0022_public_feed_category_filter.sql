-- =====================================================================
-- 0022_public_feed_category_filter.sql
--
-- The homepage feed ("Latest from the communities") becomes filterable by CATEGORY
-- via chips (All / Investing & Trading / Parenting / Property). To page correctly
-- within a selected category, filtering must happen SERVER-SIDE, so public_posts_feed
-- gains a p_category_slug parameter that joins the post's teacher to its category.
--
-- Also moves Jane from the 'business' category to a new 'property' category, so her
-- posts appear under a "Property" chip. 'business' is left in place as reference data
-- (currently unused); the chips are derived from categories that actually have public
-- posts, so an empty category never shows.
--
-- The RETURN shape is unchanged — only a filter parameter is added — but Postgres
-- treats the new signature as a different function, so this is a DROP + CREATE and the
-- grant is re-applied. A teacher with NULL category matches only the "All" (null) case.
--
-- Standalone, hand-run, then reconciled into schema.sql (feed fn) + seed.sql
-- (property category row). Idempotent: re-run the whole script on any error.
-- =====================================================================

-- (1) Property category + reassign Jane.
insert into public.categories (id, slug, name) values
  ('ca700000-0000-0000-0000-000000000004','property','Property')
on conflict (id) do nothing;

update public.teachers
   set category_id = 'ca700000-0000-0000-0000-000000000004'
 where slug = 'lelong-queen-jane';

-- (2) Feed RPC gains p_category_slug. Return columns identical to 0018.
drop function if exists public.public_posts_feed(int, int, uuid, uuid);

create or replace function public.public_posts_feed(
  p_limit        int,
  p_offset       int,
  p_teacher_id   uuid default null,
  p_author_id    uuid default null,
  p_category_slug text default null
)
returns table (
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

grant execute on function public.public_posts_feed(int, int, uuid, uuid, text) to anon, authenticated;

-- (3) Categories that have at least one PUBLIC post — drives the feed chips. Must be a
--     SECURITY DEFINER RPC (like the feed itself): anon cannot SELECT posts under RLS,
--     so a direct query would return nothing for logged-out visitors. Empty categories
--     never appear because it reads the same public post set as the feed.
create or replace function public.public_feed_categories()
returns table (slug text, name text)
language sql stable security definer set search_path to 'public'
as $$
  select distinct c.slug, c.name
  from public.posts p
  join public.teachers t   on t.id  = p.teacher_id
  join public.categories c on c.id  = t.category_id
  join public.profiles pr  on pr.id = p.author_id
  where p.is_public and not p.hidden_from_public and pr.deleted_at is null
  order by c.name;
$$;

grant execute on function public.public_feed_categories() to anon, authenticated;
