-- 0040_optional_lesson_file.sql — allow description-only document lessons (MT).
--
-- Relaxes content_items_payload_check so a document lesson no longer requires a
-- document_url (some lessons are just a title + description). Video items still
-- require a video_url OR a Bunny video_id. Idempotent.

alter table public.content_items drop constraint if exists content_items_payload_check;
alter table public.content_items add constraint content_items_payload_check check (
  (type = 'video' and (video_url is not null or video_id is not null))
  or (type = 'document')
);
