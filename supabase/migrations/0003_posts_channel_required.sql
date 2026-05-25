-- Community Channels — finalize
-- Run this in the Supabase SQL editor ONLY AFTER every existing post has been
-- assigned a channel via the /admin/migrate-posts UI (no posts with channel_id IS NULL).
--
-- Sanity check first (should return 0):
--   select count(*) from public.posts where channel_id is null;

alter table public.posts
  alter column channel_id set not null;
