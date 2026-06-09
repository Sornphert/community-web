-- ============================================================================
-- SEED DATA — community-web
-- ============================================================================
-- Run AFTER supabase/bootstrap/schema.sql on a fresh project.
-- Every statement is idempotent (`on conflict ... do nothing/update`), so it is
-- safe to re-run. These seeds are reproducible; anything teacher-specific that
-- is NOT here (real topics, real recordings/videos, admin promotion, Resend,
-- domains) lives in NEW_PROJECT_SETUP.md.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Channels  (from migrations_archive/0002_community_channels.sql)
-- Fixed UUIDs so they are stable to reference.
-- NOTE: the "announcements" description mentions "Johnson" — edit per teacher.
-- ----------------------------------------------------------------------------
insert into public.channels (id, slug, name, description, position, post_permission) values
  ('c0000000-0000-0000-0000-000000000001', 'announcements', 'Announcements', 'Official updates from Johnson. Admins post here.', 0, 'admin_only'),
  ('c0000000-0000-0000-0000-000000000002', 'general',       'General',       'Open discussion for everyone.', 1, 'all'),
  ('c0000000-0000-0000-0000-000000000003', 'testimonies',   'Testimonies',   'Share your wins and results.', 2, 'all')
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- Classroom folders + recordings (placeholders)
--   (from migrations_archive/0005_classroom_recordings.sql)
-- Fixed UUIDs; created_by left null. These are demo placeholders — replace with
-- real content per teacher.
-- ----------------------------------------------------------------------------
insert into public.classroom_folders (id, name, parent_folder_id, position) values
  ('f0000000-0000-0000-0000-000000000001', 'Foundations',     null,                                     0),
  ('f0000000-0000-0000-0000-000000000002', 'Getting Started', 'f0000000-0000-0000-0000-000000000001',   1),
  ('f0000000-0000-0000-0000-000000000003', 'Market Analysis', null,                                     1)
on conflict (id) do nothing;

insert into public.classroom_recordings (id, folder_id, title, description, position) values
  ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Introduction',             'Welcome to the recordings library. Start here.', 0),
  ('a0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'Setting Up Your Account',  'How to get your account ready before the first session.', 0),
  ('a0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'Reading the Charts',       'A first look at reading the charts together.', 0)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- Recordings TOPIC  (required: app/(app)/classroom/page.tsx hardcodes this UUID)
-- ----------------------------------------------------------------------------
-- classroom/page.tsx:9  ->  RECORDINGS_TOPIC_ID = '52a53b67-e2d0-43bf-a2db-38083b8d801d'
-- This topic is special-cased (links to the recordings folder tree, always
-- unlocked). A fresh project MUST contain this exact row or the special-case
-- silently breaks. Keeping the fixed UUID avoids any code change.
-- (The cleaner `topics.is_recordings` boolean is deferred to the later
-- parameterization pass — see NEW_PROJECT_SETUP.md.)
insert into public.topics (id, name, position, is_locked) values
  ('52a53b67-e2d0-43bf-a2db-38083b8d801d', 'Recordings', 0, false)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- Storage buckets  (captured from prod storage.buckets — all five)
-- ----------------------------------------------------------------------------
-- All five are public-read buckets; access is gated by the storage.objects RLS
-- policies in bootstrap/schema.sql Section B. Idempotent (on conflict do
-- nothing) so re-running seed.sql is safe.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars','avatars',true,2097152,'{image/jpeg,image/png,image/webp}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('content-files','content-files',true,20971520,NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('post-attachments','post-attachments',true,26214400,'{application/pdf}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('post-images','post-images',true,5242880,NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('topic-covers','topic-covers',true,2097152,NULL) on conflict (id) do nothing;
