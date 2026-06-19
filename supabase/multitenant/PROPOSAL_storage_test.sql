-- =============================================================================
-- PROPOSAL — Storage-policy companion test  (REVIEW ONLY — DO NOT RUN)
-- =============================================================================
-- Companion to PROPOSAL_test_matrix.sql. That file proves public-schema RLS;
-- this one proves the storage.objects WRITE policies from PROPOSAL_schema.sql
-- Section 9 ({teacher_id}/{uid}/... path scheme, [D4]/[A3]). It has NOT been run
-- against any database. Intended to run inside ONE begin…rollback transaction on
-- a fresh throwaway project, AFTER the schema is applied — only once the schema
-- itself is reviewed & approved.
--
-- Same harness conventions as the main matrix:
--   • Role simulation: set local role authenticated/anon + request.jwt.claims so
--     auth.uid() = claims->>'sub'; the SECURITY DEFINER helpers (has_membership /
--     is_teacher_admin) read the same GUC.
--   • Results collected into a temp _results table (granted to PUBLIC so PASS
--     inserts succeed inside the switched-role DO blocks) and SELECTed just before
--     ROLLBACK, so they show in the Supabase SQL-editor grid.
--   • Writes that must be DENIED are wrapped to assert an error was raised; FAIL
--     paths stay as raise exception so any regression aborts the whole run loudly.
--
-- POLICY SHAPES UNDER TEST (from Section 9):
--   • MEMBER buckets (avatars / post-images / post-attachments): WITH CHECK =
--       has_membership(foldername[1]::uuid) AND foldername[2] = auth.uid()::text
--     → path {teacher_id}/{uid}/...  (BOTH the teacher membership AND the uid
--       segment must match).
--   • ADMIN buckets (topic-covers / content-files): WITH CHECK =
--       is_teacher_admin(foldername[1]::uuid)
--     → path {teacher_id}/...  (NO uid segment — admin owns the whole teacher
--       prefix).
--   • content-files SELECT = bucket_id = 'content-files' ONLY → the accepted [D4]
--     public-read gap, asserted as a KNOWN-GAP marker below (NOT pass/fail).
--
-- WHAT SQL CANNOT TEST (flagged honestly — see the CAVEATS block at the end):
--   • file_size_limit / allowed_mime_types are enforced by the Storage API (Go),
--     NOT by Postgres — a direct INSERT bypasses them, so size/mime rejection is
--     untestable here.
--   • The content-files public-URL HTTP bypass happens at the CDN/render layer,
--     not in Postgres — SQL can only assert the POLICY SHAPE, never the HTTP
--     behavior. That must be verified manually in a browser.
--   • A direct INSERT into storage.objects exercises the RLS WITH CHECK expression
--     ONLY — not the full upload pipeline (owner / path_tokens / metadata that the
--     Storage API sets). The policies read only bucket_id and name, so this is a
--     faithful test of the authorization decision, but not of the upload as a whole.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- RESULTS COLLECTOR (created as the session owner, before any role switch).
-- Granted to PUBLIC so PASS / KNOWN-GAP inserts succeed under the switched
-- authenticated/anon DO blocks; the serial needs sequence USAGE too. Vanishes on
-- ROLLBACK.
-- -----------------------------------------------------------------------------
create temp table _results (seq serial primary key, msg text);
grant insert, select on _results to public;
grant usage, select on sequence _results_seq_seq to public;


-- -----------------------------------------------------------------------------
-- FIXTURES (seeded as the owner → RLS bypassed for setup)
-- Same fixture UUIDs as PROPOSAL_test_matrix.sql.
--   Teachers:  A = aaaaaaaa…   B = bbbbbbbb…
--   Profiles:  A-member = 11111111…   A-admin = 12121212…   B-member = 21212121…
-- -----------------------------------------------------------------------------
set local role postgres;  -- or the migration/owner role; bypasses RLS for seeding

insert into public.teachers (id, slug, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'teacher-a', 'Teacher A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'teacher-b', 'Teacher B');

insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000000', 'A member'),
  ('12121212-0000-0000-0000-000000000000', 'A admin'),
  ('21212121-0000-0000-0000-000000000000', 'B member');

insert into public.memberships (profile_id, teacher_id, role, status) values
  ('11111111-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','member','active'),
  ('12121212-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','admin','active'),
  ('21212121-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','member','active');

-- Storage buckets — replicate seed.sql's five buckets EXACTLY (id, public,
-- file_size_limit, allowed_mime_types), idempotent so re-running is safe.
-- storage.objects.bucket_id FKs into storage.buckets(id), so these MUST exist
-- before any object insert below. (Size/mime limits below are NOT enforced by a
-- direct SQL INSERT — see the CAVEATS block — but are replicated for fidelity.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars','avatars',true,2097152,'{image/jpeg,image/png,image/webp}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('content-files','content-files',true,20971520,NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('post-attachments','post-attachments',true,26214400,'{application/pdf}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('post-images','post-images',true,5242880,NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('topic-covers','topic-covers',true,2097152,NULL) on conflict (id) do nothing;

reset role;


-- =============================================================================
-- SECTION S — storage.objects WRITE path under each role
-- =============================================================================
-- foldername(name) drops the trailing filename, so for 'A/uid/avatar.jpg' it is
-- {A, uid}: [1]=A (teacher), [2]=uid. Every object name below therefore ends in a
-- filename segment so the folder array lines up with the policy's [1]/[2] indexing.

-- ----- S1. A-member uploads to avatars A/<A-member-uid>/avatar.jpg → ALLOWED ---
-- has_membership(A)=true AND foldername[2]=auth.uid() → WITH CHECK passes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  insert into storage.objects (bucket_id, name) values
    ('avatars',
     'aaaaaaaa-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000/avatar.jpg');
  insert into _results (msg) values
    ('S1 PASS (A-member uploads to own A/<uid>/ avatar — allowed)');
end $$;
reset role;

-- ----- S2. A-member uploads to avatars B/<A-member-uid>/… → DENIED -------------
-- WRONG TEACHER: [1]=B is a valid uuid, but has_membership(B)=false (A-member is
-- not a member of B) → RLS denies with insufficient_privilege. The [2] uid segment
-- matches, proving it is the membership check (not the uid check) doing the work.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values
      ('avatars',
       'bbbbbbbb-0000-0000-0000-000000000000/11111111-0000-0000-0000-000000000000/avatar.jpg');
    raise exception 'S2 FAIL: A-member uploaded under teacher B''s prefix';
  exception when insufficient_privilege then
    insert into _results (msg) values
      ('S2 PASS (wrong teacher prefix — has_membership(B) false — denied)');
  end;
end $$;
reset role;

-- ----- S3. A-member uploads to avatars A/<other-uid>/… → DENIED ----------------
-- CORRECT TEACHER, SOMEONE ELSE'S uid SEGMENT: has_membership(A)=true, but
-- foldername[2] = the A-admin's uid (12121212) <> auth.uid() (11111111) → the uid
-- conjunct is false → RLS denies. Proves the uid-segment check is load-bearing even
-- inside the caller's own teacher.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values
      ('avatars',
       'aaaaaaaa-0000-0000-0000-000000000000/12121212-0000-0000-0000-000000000000/avatar.jpg');
    raise exception 'S3 FAIL: A-member uploaded into another user''s uid segment';
  exception when insufficient_privilege then
    insert into _results (msg) values
      ('S3 PASS (correct teacher, foreign uid segment — denied)');
  end;
end $$;
reset role;

-- ----- S4. A-member uploads with a MALFORMED non-uuid teacher segment → DENIED -
-- 'not-a-uuid' is not castable to uuid, so ((foldername[1])::uuid) RAISES
-- invalid_text_representation (22P02) while evaluating the WITH CHECK → the write
-- FAILS CLOSED. We accept either the cast error (22P02) OR insufficient_privilege
-- (42501) — some planners may short-circuit differently — the only wrong outcome is
-- a successful insert. This is the [A3] "malformed teacher segment fails closed"
-- guarantee.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values
      ('avatars',
       'not-a-uuid/11111111-0000-0000-0000-000000000000/avatar.jpg');
    raise exception 'S4 FAIL: malformed teacher segment was accepted';
  exception
    when invalid_text_representation then
      insert into _results (msg) values
        ('S4 PASS (non-uuid teacher segment — ::uuid cast raised 22P02, fails closed)');
    when insufficient_privilege then
      insert into _results (msg) values
        ('S4 PASS (non-uuid teacher segment — denied 42501, fails closed)');
  end;
end $$;
reset role;

-- ----- S5. Admin bucket (topic-covers): non-admin DENIED, admin ALLOWED --------
-- topic-covers WITH CHECK = is_teacher_admin(foldername[1]) ONLY (NO uid segment),
-- so the path is {teacher_id}/<file>.

-- S5a. A-member (NON-admin) uploads to topic-covers A/cover.jpg → DENIED.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values
      ('topic-covers','aaaaaaaa-0000-0000-0000-000000000000/cover.jpg');
    raise exception 'S5a FAIL: non-admin uploaded a topic cover';
  exception when insufficient_privilege then
    insert into _results (msg) values
      ('S5a PASS (non-admin topic-cover write denied)');
  end;
end $$;
reset role;

-- S5b. A-admin uploads to topic-covers A/cover-admin.jpg → ALLOWED.
-- (Distinct filename from S5a to avoid the storage.objects (bucket_id, name) unique
-- collision — S5a's row never committed, but keep names disjoint regardless.)
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  insert into storage.objects (bucket_id, name) values
    ('topic-covers','aaaaaaaa-0000-0000-0000-000000000000/cover-admin.jpg');
  insert into _results (msg) values
    ('S5b PASS (A-admin uploads topic cover for own teacher — allowed)');
end $$;
reset role;

-- ----- S6. Cross-teacher admin: A-admin uploads to content-files B/… → DENIED --
-- is_teacher_admin(B)=false for the A-admin → RLS denies. Confirms admin authority
-- does NOT leak across tenants on the admin buckets either.
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values
      ('content-files','bbbbbbbb-0000-0000-0000-000000000000/lesson.pdf');
    raise exception 'S6 FAIL: A-admin wrote into teacher B''s content-files prefix';
  exception when insufficient_privilege then
    insert into _results (msg) values
      ('S6 PASS (cross-teacher admin content-files write denied — is_teacher_admin(B) false)');
  end;
end $$;
reset role;


-- =============================================================================
-- SECTION K — [D4] KNOWN-GAP: content-files public-read is NOT tenant-isolated
-- =============================================================================
-- This is NOT a pass/fail assertion. The content-files SELECT policy is bucket-
-- scoped (`bucket_id = 'content-files'`) with NO path/teacher predicate, and the
-- bucket is PUBLIC — so a content-files object IS readable by anyone holding its
-- public object URL, bypassing RLS and tenant isolation. That is the accepted [D4]
-- v1 gap (the deferred fix is a private bucket + signed URLs).
--
-- SQL can assert only the POLICY SHAPE, not the HTTP behavior: the actual public-
-- URL bypass happens at the storage CDN / render layer, OUTSIDE Postgres. We
-- therefore (1) confirm the policy is shaped as documented (and raise loudly if the
-- gap was silently CLOSED, so this marker can never go stale against the schema),
-- then (2) record a KNOWN-GAP row with an explicit "verify in a browser" note.
--
-- Runs as the session owner (pg_policies is a readable system view).
do $$
declare
  v_qual text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'content_files_select';

  if v_qual is null then
    raise exception 'KNOWN-GAP CHECK FAIL: content_files_select policy not found';
  end if;

  -- The gap exists iff the SELECT predicate references ONLY the bucket and applies
  -- no per-path / per-teacher restriction. If any teacher/path predicate has been
  -- added, the gap is CLOSED and this marker is stale → fail loudly so it is fixed.
  if v_qual ~* 'foldername' or v_qual ~* 'has_membership'
     or v_qual ~* 'is_teacher_admin' or v_qual ~* 'teacher' then
    raise exception
      'KNOWN-GAP CHECK FAIL: content_files_select now has a path/teacher predicate (%) — the [D4] gap appears CLOSED; update this test and the schema FLAG.',
      v_qual;
  end if;

  insert into _results (msg) values
    ('KNOWN-GAP [D4]: content-files SELECT is bucket-scoped (no path/teacher check) on a PUBLIC bucket → public-URL read bypasses tenant isolation. Accepted v1 gap; fix = private bucket + signed URLs. NOTE: the actual HTTP public-URL bypass is CDN-layer and MUST be verified manually in a browser — SQL asserts only the policy shape.');
end $$;


-- =============================================================================
-- RESULTS GRID — emit every PASS / KNOWN-GAP row. MUST run before ROLLBACK (the
-- temp table is dropped by the rollback). A clean run returns one row per S* PASS
-- plus the single KNOWN-GAP row; any genuine failure would have aborted earlier
-- via raise exception.
-- =============================================================================
select msg from _results order by seq;


-- =============================================================================
-- Cleanup — never persist test data (objects, buckets, fixtures all roll back).
-- =============================================================================
rollback;


-- =============================================================================
-- CAVEATS — what this SQL test CANNOT cover (call out, don't pretend it's closed)
-- =============================================================================
-- 1. SIZE / MIME enforcement: file_size_limit and allowed_mime_types on
--    storage.buckets are enforced by the Storage API (Go service), NOT by Postgres
--    constraints. A direct SQL INSERT into storage.objects bypasses them entirely,
--    so "reject a 30 MB avatar" or "reject a .exe into post-attachments" cannot be
--    asserted here. Verify via the Storage API / a real upload.
-- 2. content-files PUBLIC-URL BYPASS [D4]: only the policy SHAPE is asserted (Section
--    K). The real isolation gap manifests as an HTTP GET to the public object URL
--    succeeding for a non-member — that resolves at the CDN/render layer, outside
--    Postgres. Verify manually in a browser (open another teacher's content-files
--    public URL while logged out / as a different tenant).
-- 3. FULL UPLOAD PIPELINE: direct INSERTs test the RLS WITH CHECK expression only.
--    The Storage API additionally sets owner / owner_id / path_tokens / metadata and
--    may run triggers; those are not exercised here. The policies read only
--    bucket_id and name, so the authorization decision IS faithfully tested — the
--    surrounding pipeline is not.
-- 4. UPDATE / DELETE write paths reuse the SAME predicate as INSERT for every bucket
--    in Section 9 (avatars/post-images add UPDATE/DELETE; admin buckets add
--    UPDATE/DELETE), so INSERT is used as the representative write. If the predicates
--    ever diverge per-verb, add explicit UPDATE/DELETE cases here.
-- 5. ANON: every storage write policy is TO authenticated and anon holds no storage
--    grants, so anon writes are denied by construction (mirrors matrix Section I).
--    Not re-proven here to keep this script focused on the teacher/uid path logic.
-- =============================================================================
-- End of PROPOSAL_storage_test.sql — REVIEW ONLY. Do not run until approved.
-- =============================================================================
