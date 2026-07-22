-- =====================================================================
-- 0018_public_feed_absolute_image_url.sql
--
-- public_posts_feed returned image_path (post_images.storage_path) and the client
-- rebuilt a URL with getPublicUrl() against THIS project's post-images bucket. That
-- only works for images whose bytes actually live in this project's bucket.
--
-- post_images ALSO stores `url` — a fully-qualified public URL — and every writer
-- populates it: the composer sets it from getPublicUrl() at upload time, and the
-- in-app post card/detail already render from `url`, not from storage_path. So `url`
-- is the authoritative, always-correct address for an image; storage_path is only
-- meaningful for bucket operations (delete/move) within the owning project.
--
-- This matters because content imported from the single-tenant projects keeps its
-- ORIGINAL public URL (the bytes stay in the source project's public bucket). Under
-- the old behaviour the homepage feed rebuilt those paths against MT's bucket and
-- produced 404s — 32 public posts rendered a broken thumbnail.
--
-- CHANGE: return `image_url` (absolute) instead of `image_path`. The client stops
-- calling getPublicUrl entirely and uses the value as-is. Native MT posts are
-- unaffected (their url is already an MT getPublicUrl result); imported posts now
-- resolve to their source bucket and render.
--
-- SECURITY: unchanged. Same WHERE clause, same row set, same author_id exposure.
-- A public URL for an already-public post is not new information — the in-app card
-- has always rendered this exact value.
--
-- RETURNS shape changes (image_path -> image_url), so this is a DROP + CREATE and
-- the grants are re-applied. Standalone, hand-run, then reconciled into schema.sql.
-- Idempotent: re-run the whole script on any error.
-- =====================================================================

drop function if exists public.public_posts_feed(int, int, uuid, uuid);

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

grant execute on function public.public_posts_feed(int, int, uuid, uuid) to anon, authenticated;
