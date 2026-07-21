-- =====================================================================
-- 0017_post_videos_multi.sql   (single-tenant / production)
-- Allow MULTIPLE videos per post.
--
-- Until now post_videos carried UNIQUE (post_id), so a post could hold exactly
-- one video — the composer, the PostgREST embed (returned as a single object
-- rather than an array) and the renderer were all built on that. Dropping the
-- constraint and adding an explicit sort key mirrors how post_images already
-- works (many rows per post, ordered by "position").
--
-- Safe on existing data: every current post has 0 or 1 video row, which becomes
-- position 0. Nothing is deleted and no row shape changes for readers that only
-- look at the first video.
--
-- Hand-run in the Supabase SQL editor. Idempotent: re-run on any error.
-- =====================================================================

-- (1) Drop the one-video-per-post constraint.
alter table public.post_videos
  drop constraint if exists post_videos_post_id_key;

-- (2) Explicit ordering key (matches post_images."position").
alter table public.post_videos
  add column if not exists "position" smallint not null default 0;

-- (3) Index the read path: all videos for a post, in display order.
create index if not exists post_videos_post_position_idx
  on public.post_videos (post_id, "position");
