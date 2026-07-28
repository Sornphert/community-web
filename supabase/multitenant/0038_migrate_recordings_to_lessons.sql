-- 0038_migrate_recordings_to_lessons.sql — one-time DATA migration (MT).
--
-- Cutover from the folder-based recordings system to uniform video lessons: copy
-- each teacher's classroom_recordings into content_items (type='video') under that
-- teacher's is_recordings topic, flattening folders into a single ordered list.
--
-- Non-destructive + idempotent: classroom_recordings rows are KEPT (reversible), and
-- a recording already copied (same video_id under the same teacher) is skipped, so
-- re-running does nothing. Recordings without a Bunny video_id are skipped (the
-- content_items payload check requires video_url OR video_id).

insert into public.content_items
  (teacher_id, topic_id, type, title, description,
   video_provider, video_id, video_status, video_duration_seconds, video_thumbnail_url,
   "position")
select
  r.teacher_id,
  t.id,
  'video',
  r.title,
  r.description,
  coalesce(r.video_provider, 'bunny'),
  r.video_id,
  r.video_status,
  r.video_duration_seconds,
  r.video_thumbnail_url,
  ( (select coalesce(max(ci.position), -1)
       from public.content_items ci where ci.topic_id = t.id)
    + row_number() over (partition by t.id order by r.position, r.created_at) )::smallint
from public.classroom_recordings r
join public.topics t
  on t.teacher_id = r.teacher_id and t.is_recordings = true
where r.video_id is not null
  and not exists (
    select 1 from public.content_items ci
    where ci.teacher_id = r.teacher_id and ci.video_id = r.video_id
  );
