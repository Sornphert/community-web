-- 0037_content_video_lessons.sql — Bunny video lessons in any topic (MT).
--
-- Lets a normal content_item (type='video') be an UPLOADED Bunny video, not just a
-- Vimeo URL. Adds the same video_* columns classroom_recordings/post_videos carry,
-- and relaxes the payload check so a video item is valid with EITHER a video_url
-- (external) OR a video_id (Bunny upload). The Bunny transcode webhook + admin
-- Refresh update these rows by video_id (same machinery as recordings).
--
-- Idempotent: safe to re-run.

alter table public.content_items
  add column if not exists video_provider         text,
  add column if not exists video_id               text,
  add column if not exists video_status           text,
  add column if not exists video_duration_seconds integer,
  add column if not exists video_thumbnail_url     text;

create index if not exists content_items_video_id_idx on public.content_items (video_id);

alter table public.content_items drop constraint if exists content_items_payload_check;
alter table public.content_items add constraint content_items_payload_check check (
  ((type = 'document') and (document_url is not null)) or
  ((type = 'video') and ((video_url is not null) or (video_id is not null)))
);
