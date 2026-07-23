-- =============================================================================
-- supabase/multitenant/seed.sql — MT content seed (non-persona)
-- =============================================================================
-- Run AFTER multitenant/schema.sql, BEFORE scripts/dev-seed-personas.ts.
-- Idempotent. Reproduces community-mt-dev's NON-PERSONA content:
--   2 teachers (A=prophet-system, B=movement-bootcamp)
--   + per-teacher channels/topics/content/folders/recordings/events + 7 buckets.
-- Persona auth.users + memberships + demo posts are created by dev-seed-personas.ts
-- (auth users cannot be plain-INSERTed). UUIDs are stable/readable — this reproduces
-- live's content STRUCTURE, not the ad-hoc app-test rows byte-for-byte (the Part E
-- gate is a SCHEMA diff).
--
-- REMOVED: teacher C (empty-academy). It existed as a member-less, content-less
-- tenant for isolation tests, but it also surfaced as a stray tenant in the public
-- directory. If you need an empty-tenant fixture again, insert it ad hoc in the test
-- rather than seeding it into every project.
-- =============================================================================

insert into public.teachers (id, slug, name) values
  ('a1a1a1a1-0000-0000-0000-000000000000','prophet-system',   'The Prophet System'),
  ('b2b2b2b2-0000-0000-0000-000000000000','movement-bootcamp','Movement Bootcamp')
on conflict (id) do nothing;

-- Categories (platform reference data; managed by SQL/service-role). Stable UUIDs.
insert into public.categories (id, slug, name) values
  ('ca700000-0000-0000-0000-000000000001','investing','Investing & Trading'),
  ('ca700000-0000-0000-0000-000000000002','parenting','Parenting'),
  ('ca700000-0000-0000-0000-000000000003','business', 'Business & Entrepreneurship')
on conflict (id) do nothing;

-- Assign dev teachers to categories.
update public.teachers set category_id = 'ca700000-0000-0000-0000-000000000001'
  where id = 'a1a1a1a1-0000-0000-0000-000000000000';  -- prophet-system   -> investing
update public.teachers set category_id = 'ca700000-0000-0000-0000-000000000002'
  where id = 'b2b2b2b2-0000-0000-0000-000000000000';  -- movement-bootcamp -> parenting

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
  ('275342ec-1064-480e-bf31-97a97e743059','b2b2b2b2-0000-0000-0000-000000000000','B Fundamentals',0,false,false),
  ('b2700000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000','B Recordings',  1,false,true)
on conflict (id) do nothing;

-- Content items (documents) under each Fundamentals topic
insert into public.content_items (id, teacher_id, topic_id, type, title, position, document_url) values
  ('a1c10000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','a1700000-0000-0000-0000-000000000001','document','A Lesson 1',0,'https://example.test/a/lesson1.pdf'),
  ('b2c10000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','275342ec-1064-480e-bf31-97a97e743059','document','B Lesson 1',0,'https://example.test/b/lesson1.pdf')
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

-- Newsletter items (migration 0005) — public homepage feed, grouped by category. Two
-- teachers in DIFFERENT categories so cross-category write-denial checks are non-vacuous:
-- A=prophet-system/investing (x2), B=movement-bootcamp/parenting (x1). category_id MUST
-- match the teacher's category (the write RLS enforces it; here we hand-match). created_by
-- is left NULL (personas aren't in seed.sql; created_by is nullable, ON DELETE SET NULL).
insert into public.newsletter_items (id, teacher_id, category_id, url, headline, blurb) values
  ('a1b00000-0000-0000-0000-000000000001','a1a1a1a1-0000-0000-0000-000000000000','ca700000-0000-0000-0000-000000000001','https://example.test/a/market-outlook','A: Weekly market outlook','What to watch in the week ahead.'),
  ('a1b00000-0000-0000-0000-000000000002','a1a1a1a1-0000-0000-0000-000000000000','ca700000-0000-0000-0000-000000000001','https://example.test/a/risk-basics','A: Position sizing basics','A short primer on managing risk per trade.'),
  ('b2b00000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','ca700000-0000-0000-0000-000000000002','https://example.test/b/screen-time','B: Screen-time that works','A practical routine for calmer evenings.')
on conflict (id) do nothing;

-- Classroom TIER TAGS (migration 0006) — proves tag-gating end to end on teacher B.
-- IDs mirror the CORRECT fixture hand-created on community-mt-dev (verbatim, so a fresh
-- rebuild reproduces it). Add a SECOND, UNGATED B topic (+ content_item) so "ungated
-- readable by all members" is non-vacuous (B Fundamentals, 275342ec…, is the gated one).
-- NOTE: B Open Topic's id (b2c00000-…-0001) intentionally equals the B "general" CHANNEL id
-- (line 39) — this is the live fixture value; topics and channels are separate tables so the
-- shared UUID is legal and causes NO PK/FK collision.
insert into public.topics (id, teacher_id, name, position, is_locked, is_recordings) values
  ('b2c00000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','B Open Topic',2,false,false)
on conflict (id) do nothing;
insert into public.content_items (id, teacher_id, topic_id, type, title, position, document_url) values
  ('b2c00000-0000-0000-0000-0000000000a1','b2b2b2b2-0000-0000-0000-000000000000','b2c00000-0000-0000-0000-000000000001','document','Open Lesson',0,'https://example.test/b/open-lesson.pdf')
on conflict (id) do nothing;

-- Two B tags. Personas hold these via member_tags, assigned in scripts/dev-seed-personas.ts
-- (member_tags needs real profile_ids): bmember@ → movexercise8 ONLY (denied the gated topic);
-- dual@ → movexercise8 + bootcamp (allowed).
insert into public.tags (id, teacher_id, name, color) values
  ('b2100000-0000-0000-0000-000000000001','b2b2b2b2-0000-0000-0000-000000000000','movexercise8',null),
  ('b2100000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000','bootcamp',null)
on conflict (id) do nothing;

-- Gate B Fundamentals (275342ec…, holds B Lesson 1) on [bootcamp]. B Open Topic stays ungated.
insert into public.topic_tags (topic_id, tag_id, teacher_id) values
  ('275342ec-1064-480e-bf31-97a97e743059','b2100000-0000-0000-0000-000000000002','b2b2b2b2-0000-0000-0000-000000000000')
on conflict (topic_id, tag_id) do nothing;

-- Storage buckets. Public-read EXCEPT the two DOCUMENT buckets, which are PRIVATE:
--   • content-files     (0019) — classroom lesson files
--   • post-attachments  (0020) — PDFs attached to posts
-- Neither may be fetchable by URL alone, so reads go through a short-lived signed url
-- minted under a storage SELECT policy (active member of the owning teacher). Image
-- buckets stay public: post-images already surface on the anon homepage feed by design,
-- and avatars/covers/logos are branding. Writes for every bucket are gated by
-- storage.objects RLS in schema.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',         'avatars',         true, 2097152,  '{image/jpeg,image/png,image/webp}'),
  ('content-files',   'content-files',   false, 20971520, null),
  ('post-attachments','post-attachments',false, 26214400, '{application/pdf}'),
  ('post-images',     'post-images',     true, 5242880,  null),
  ('topic-covers',    'topic-covers',    true, 2097152,  null),
  ('teacher-covers',  'teacher-covers',  true, 2097152,  null),
  ('teacher-logos',   'teacher-logos',   true, 2097152,  null)
on conflict (id) do nothing;

-- =============================================================================
-- End of multitenant/seed.sql. Run scripts/dev-seed-personas.ts next.
-- =============================================================================
