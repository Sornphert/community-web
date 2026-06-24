-- =============================================================================
-- supabase/multitenant/seed.sql — MT content seed (non-persona)
-- =============================================================================
-- Run AFTER multitenant/schema.sql, BEFORE scripts/dev-seed-personas.ts.
-- Idempotent. Reproduces community-mt-dev's NON-PERSONA content:
--   3 teachers (A=prophet-system, B=movement-bootcamp, C=empty-academy[EMPTY])
--   + per-teacher channels/topics/content/folders/recordings/events + 5 buckets.
-- Persona auth.users + memberships + demo posts are created by dev-seed-personas.ts
-- (auth users cannot be plain-INSERTed). UUIDs are stable/readable — this reproduces
-- live's content STRUCTURE, not the ad-hoc app-test rows byte-for-byte (the Part E
-- gate is a SCHEMA diff). Teacher C is intentionally left empty (a member-less,
-- content-less teacher in the directory, for isolation tests).
-- =============================================================================

insert into public.teachers (id, slug, name) values
  ('a1a1a1a1-0000-0000-0000-000000000000','prophet-system',   'The Prophet System'),
  ('b2b2b2b2-0000-0000-0000-000000000000','movement-bootcamp','Movement Bootcamp'),
  ('c3c3c3c3-0000-0000-0000-000000000000','empty-academy',    'Empty Academy')
on conflict (id) do nothing;

-- Channels — A: general(all)+announcements(admin_only); B: +trading-floor; C: none
insert into public.channels (id, teacher_id, slug, name, description, position, post_permission, section) values
  ('a1c00000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','general',      'General',      'Open discussion for all members',0,'all',       'community'),
  ('a1c00000-0000-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000000','announcements','Announcements','Official updates',               1,'admin_only','community'),
  ('b2c00000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','general',      'General',      'Bootcamp chat',                  0,'all',       'community'),
  ('b2c00000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000','announcements','Announcements',null,                             1,'admin_only','community'),
  ('b2c00000-0000-0000-0000-000000000003','b2b2b2b2-0000-0000-0000-000000000000','trading-floor','Trading Floor',null,                             2,'all',       'community')
on conflict (id) do nothing;

-- Topics — exactly one is_recordings=true per teacher (partial unique enforces it)
insert into public.topics (id, teacher_id, name, position, is_locked, is_recordings) values
  ('a1700000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','A Fundamentals',0,false,false),
  ('a1700000-0000-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000000','A Recordings',  1,false,true),
  ('b2700000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','B Fundamentals',0,false,false),
  ('b2700000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000','B Recordings',  1,false,true)
on conflict (id) do nothing;

-- Content items (documents) under each Fundamentals topic
insert into public.content_items (id, teacher_id, topic_id, type, title, position, document_url) values
  ('a1c10000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','a1700000-0000-0000-0000-000000000001','document','A Lesson 1',0,'https://example.test/a/lesson1.pdf'),
  ('b2c10000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','b2700000-0000-0000-0000-000000000001','document','B Lesson 1',0,'https://example.test/b/lesson1.pdf')
on conflict (id) do nothing;

-- Classroom folders (parent → child). The parent↔child composite FK is DEFERRABLE
-- INITIALLY DEFERRED, so this single multi-row INSERT validates at commit regardless
-- of row order.
insert into public.classroom_folders (id, teacher_id, name, parent_folder_id, position) values
  ('a1f00000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','A Parent Folder',null,                                   0),
  ('a1f00000-0000-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000000','A Child Folder', 'a1f00000-0000-0000-0000-000000000001',0),
  ('b2f00000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','B Parent Folder',null,                                   0),
  ('b2f00000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000','B Child Folder', 'b2f00000-0000-0000-0000-000000000001',0)
on conflict (id) do nothing;

-- Recordings (in the child folders)
insert into public.classroom_recordings (id, teacher_id, folder_id, title, description, position, video_status) values
  ('a1a00000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','a1f00000-0000-0000-0000-000000000002','A Recording 1','Seed recording for A',0,'pending'),
  ('b2a00000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','b2f00000-0000-0000-0000-000000000002','B Recording 1','Seed recording for B',0,'pending')
on conflict (id) do nothing;

-- Events (starts_at from live; ends_at illustrative = starts_at + 1h)
insert into public.events (id, teacher_id, title, starts_at, ends_at) values
  ('a1e00000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','A Market Briefing', '2026-07-04T01:00:00+00:00','2026-07-04T02:00:00+00:00'),
  ('a1e00000-0000-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000000','A Live Q&A',        '2026-07-11T07:00:00+00:00','2026-07-11T08:00:00+00:00'),
  ('b2e00000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','B Town Hall',       '2026-07-03T02:00:00+00:00','2026-07-03T03:00:00+00:00'),
  ('b2e00000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000','B Strategy Session','2026-07-10T06:00:00+00:00','2026-07-10T07:00:00+00:00')
on conflict (id) do nothing;

-- Storage buckets (all public-read; gated by storage.objects RLS in schema.sql)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',         'avatars',         true, 2097152,  '{image/jpeg,image/png,image/webp}'),
  ('content-files',   'content-files',   true, 20971520, null),
  ('post-attachments','post-attachments',true, 26214400, '{application/pdf}'),
  ('post-images',     'post-images',     true, 5242880,  null),
  ('topic-covers',    'topic-covers',    true, 2097152,  null)
on conflict (id) do nothing;

-- =============================================================================
-- End of multitenant/seed.sql. Run scripts/dev-seed-personas.ts next.
-- =============================================================================
