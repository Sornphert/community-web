-- =============================================================================
-- PROPOSAL — Multi-Tenant Phase 1 isolation test matrix  (REVIEW ONLY — DO NOT RUN)
-- =============================================================================
-- A reviewable test plan that PROVES the isolation guarantees of PROPOSAL_schema.sql.
-- It has NOT been run against any database (not even a scratch one). Intended to be
-- run inside ONE transaction that ROLLS BACK, after the schema is applied to a fresh
-- throwaway project — only once the schema itself is reviewed & approved.
--
-- How role simulation works: each scenario does
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<profile-uuid>","role":"authenticated"}';
-- so auth.uid() = (claims->>'sub')::uuid and RLS applies as that user. The SECURITY
-- DEFINER helpers (has_membership / is_teacher_admin) read the same GUC.
--
-- RESULTS: the Supabase SQL editor swallows `raise notice`, so a clean run would show
-- only "Success, no rows returned". To make the grid visible, every PASS is recorded
-- into a temp table _results and SELECTed just before the final ROLLBACK. FAIL paths
-- stay as `raise exception` so any failure still aborts the whole run loudly.
--   • _results is granted to PUBLIC (and its serial sequence) because the PASS inserts
--     execute INSIDE DO blocks running under the switched authenticated/anon roles.
--   • The SELECT must precede ROLLBACK — the temp table is dropped by the rollback.
--
-- Assertion style: SELECT scenarios assert a row COUNT; write scenarios that must be
-- DENIED are wrapped to assert an error was raised (insufficient_privilege = RLS,
-- foreign_key_violation = composite-FK fail-closed, 42501 = column-grant).
--
-- DEFERRED-CONSTRAINT NOTE: classroom_folders_parent_same_teacher_fkey is DEFERRABLE
-- INITIALLY DEFERRED, so its violation is raised at COMMIT (or when forced IMMEDIATE),
-- NOT at the INSERT statement. Inside this begin…rollback harness, COMMIT never runs,
-- so any test that needs to OBSERVE that violation must force the check with
-- SET CONSTRAINTS … IMMEDIATE (see F4). F5 is its matched pair: the legitimate
-- out-of-order tree must stay DEFERRED so it commits cleanly. (F4 forcing mechanism
-- verified on a scratch DB: it raises a catchable foreign_key_violation.)
--
-- Covers the three reinforcements explicitly:
--   [R1] composite-FK fail-closed (cross-teacher month/folder/parent) — Section F
--   [R2] has_membership(NULL) = false                                 — Section A
--   [R3] nothing privilege-bearing on profiles to escalate into       — Section G
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- RESULTS COLLECTOR (created as the session owner, before any role switch).
-- Granted to PUBLIC so PASS inserts succeed under authenticated/anon DO blocks;
-- the serial needs sequence USAGE too. Vanishes on ROLLBACK.
-- -----------------------------------------------------------------------------
create temp table _results (seq serial primary key, msg text);
grant insert, select on _results to public;
grant usage, select on sequence _results_seq_seq to public;

-- -----------------------------------------------------------------------------
-- FIXTURES  (seeded as the table owner / privileged role → RLS bypassed for setup)
-- -----------------------------------------------------------------------------
-- Fixed UUIDs for readability.
--   Teachers:  A = aaaaaaaa…  B = bbbbbbbb…
--   Profiles:  u_amem(11..) u_aadm(12..) u_bmem(21..) u_dual(31..) u_none(41..) u_arev(51..)
set local role postgres;  -- or the migration/owner role; bypasses RLS for seeding

insert into public.teachers (id, slug, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'teacher-a', 'Teacher A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'teacher-b', 'Teacher B');

insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000000', 'A member'),
  ('12121212-0000-0000-0000-000000000000', 'A admin'),
  ('21212121-0000-0000-0000-000000000000', 'B member'),
  ('31313131-0000-0000-0000-000000000000', 'Dual member'),
  ('41414141-0000-0000-0000-000000000000', 'No member'),
  ('51515151-0000-0000-0000-000000000000', 'A revoked');

insert into public.memberships (profile_id, teacher_id, role, status) values
  ('11111111-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','member','active'),
  ('12121212-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','admin','active'),
  ('21212121-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','member','active'),
  ('31313131-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','member','active'),
  ('31313131-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','member','active'),
  ('51515151-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','member','revoked');
-- u_none (41..) has NO membership row at all.

-- Spine content for A and B.
insert into public.channels (id, teacher_id, slug, name, post_permission, section) values
  ('ca000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','general','General (A)','all','community'),
  ('ca000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000000','announce','Announce (A)','admin_only','community'),
  ('cb000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','general','General (B)','all','community');

insert into public.posts (id, teacher_id, author_id, body, channel_id) values
  ('40a00000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000','A post','ca000000-0000-0000-0000-000000000000'),
  ('40b00000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','21212121-0000-0000-0000-000000000000','B post','cb000000-0000-0000-0000-000000000000');

insert into public.comments (id, post_id, author_id, body) values
  ('c0a00000-0000-0000-0000-000000000000','40a00000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000','A comment'),
  ('c0b00000-0000-0000-0000-000000000000','40b00000-0000-0000-0000-000000000000','21212121-0000-0000-0000-000000000000','B comment');

insert into public.week_groups (id, teacher_id, name) values
  ('46000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','A Month'),
  ('46000000-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000000','B Month');

insert into public.classroom_folders (id, teacher_id, name) values
  ('f0a00000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','A Folder'),
  ('f0b00000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','B Folder');

reset role;


-- =============================================================================
-- SECTION A — [R2] has_membership(NULL) MUST return false (never error)
-- =============================================================================
do $$
begin
  if public.has_membership(null) is distinct from false then
    raise exception '[R2] FAIL: has_membership(NULL) did not return false';
  end if;
  if public.is_teacher_admin(null) is distinct from false then
    raise exception '[R2] FAIL: is_teacher_admin(NULL) did not return false';
  end if;
  insert into _results (msg) values ('[R2] PASS: NULL teacher_id denies, no error');
end $$;


-- =============================================================================
-- SECTION B — SELECT isolation: each user sees only their teacher's spine rows
-- =============================================================================

-- B1. A-member: sees A's post only, A's channels only.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
-- SCOPED to fixture UUIDs (Section B teachers A/B) so persistent seed data on the
-- target DB cannot perturb the counts. (community-mt-dev carries real teachers/posts
-- on top of this harness's own fixtures — absolute count(*) over the whole table is
-- not a stable assertion.)
do $$
begin
  if (select count(*) from public.posts
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 1
     then raise exception 'A-member should see 1 fixture post'; end if;
  if (select count(*) from public.posts where teacher_id = 'bbbbbbbb-0000-0000-0000-000000000000') <> 0
     then raise exception 'A-member saw a non-A fixture post'; end if;
  if (select count(*) from public.channels
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 2
     then raise exception 'A-member should see 2 A channels'; end if;
  if (select count(*) from public.comments
        where post_id in ('40a00000-0000-0000-0000-000000000000','40b00000-0000-0000-0000-000000000000')) <> 1
     then raise exception 'A-member should see 1 A comment'; end if;
  insert into _results (msg) values ('B1 PASS');
end $$;
reset role;

-- B2. B-member: sees zero A rows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"21212121-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.posts where teacher_id = 'aaaaaaaa-0000-0000-0000-000000000000') <> 0
     then raise exception 'B-member saw an A post'; end if;
  if (select count(*) from public.posts
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 1
     then raise exception 'B-member should see exactly 1 (B) fixture post'; end if;
  insert into _results (msg) values ('B2 PASS');
end $$;
reset role;

-- B3. Dual-member: sees BOTH teachers' rows, correctly partitioned.
set local role authenticated;
set local request.jwt.claims = '{"sub":"31313131-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.posts
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 2
     then raise exception 'Dual should see 2 fixture posts'; end if;
  if (select count(*) from public.channels
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 3
     then raise exception 'Dual should see 3 fixture channels'; end if;
  insert into _results (msg) values ('B3 PASS');
end $$;
reset role;

-- B4. Non-member: sees no CONTENT. (The teacher DIRECTORY is open as of the Phase 2
--     shell — teachers_select_all USING(true) — so teachers is visible; content
--     isolation is what B4 asserts. The open-directory widening is proven surgical
--     in Section K.)
set local role authenticated;
set local request.jwt.claims = '{"sub":"41414141-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.posts
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 0
     then raise exception 'Non-member saw fixture posts'; end if;
  if (select count(*) from public.channels
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 0
     then raise exception 'Non-member saw fixture channels'; end if;
  if (select count(*) from public.teachers
        where id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 2
     then raise exception 'Non-member cannot see open teacher directory'; end if;  -- open directory [Phase 2]
  insert into _results (msg) values ('B4 PASS');
end $$;
reset role;

-- B5. Revoked A-member: treated as non-member (status<>active).
set local role authenticated;
set local request.jwt.claims = '{"sub":"51515151-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.posts
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 0
     then raise exception 'Revoked member saw fixture posts'; end if;
  insert into _results (msg) values ('B5 PASS');
end $$;
reset role;


-- =============================================================================
-- SECTION C — Write isolation: cannot write into another teacher
-- =============================================================================

-- C1. A-admin cannot create a channel in teacher B (is_teacher_admin(B) = false).
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.channels (teacher_id, slug, name) values
      ('bbbbbbbb-0000-0000-0000-000000000000','sneaky','Sneaky');
    raise exception 'C1 FAIL: A-admin inserted a B channel';
  exception when insufficient_privilege then insert into _results (msg) values ('C1 PASS (RLS denied)');
  end;
end $$;
reset role;

-- C2. A-member (non-admin) cannot post to an admin_only channel.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.posts (teacher_id, author_id, body, channel_id) values
      ('aaaaaaaa-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000','nope',
       'ca000000-0000-0000-0000-000000000001');  -- announce = admin_only
    raise exception 'C2 FAIL: member posted to admin_only channel';
  exception when insufficient_privilege then insert into _results (msg) values ('C2 PASS (RLS denied)');
  end;
end $$;
reset role;

-- C3. A-member cannot insert a post claiming teacher B (no membership).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.posts (teacher_id, author_id, body) values
      ('bbbbbbbb-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000','cross');
    raise exception 'C3 FAIL: A-member inserted a B post';
  exception when insufficient_privilege then insert into _results (msg) values ('C3 PASS (RLS denied)');
  end;
end $$;
reset role;


-- =============================================================================
-- SECTION D — Leaf scoping (incl. [A2] comment_likes 2-hop)
-- =============================================================================

-- D1. A-member can like A's comment (2-hop resolves to teacher A).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  insert into public.comment_likes (comment_id, user_id) values
    ('c0a00000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000');
  insert into _results (msg) values ('D1 PASS (2-hop allowed for own teacher)');
end $$;
reset role;

-- D2. A-member CANNOT like B's comment (2-hop resolves to teacher B → deny).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.comment_likes (comment_id, user_id) values
      ('c0b00000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000');
    raise exception 'D2 FAIL: A-member liked a B comment';
  exception when insufficient_privilege then insert into _results (msg) values ('D2 PASS (2-hop denied cross-teacher)');
  end;
end $$;
reset role;

-- D3. Missing parent → NULL teacher_id → [R2] deny (no error from the policy).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.comment_likes (comment_id, user_id) values
      ('deadbeef-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000');
    raise exception 'D3 FAIL: liked a nonexistent comment';
  exception
    when insufficient_privilege then insert into _results (msg) values ('D3 PASS (RLS denied via NULL teacher)');
    when foreign_key_violation then insert into _results (msg) values ('D3 PASS (FK denied)');  -- comment FK also catches this
  end;
end $$;
reset role;


-- =============================================================================
-- SECTION E — content access gates own progress
-- =============================================================================
-- E1. Revoked A-member cannot insert progress for A content (has_membership=false).
--     (Uses a content_item; seed one for completeness.)
set local role postgres;
insert into public.topics (id, teacher_id, name) values
  ('70a00000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','A Topic');
insert into public.content_items (id, teacher_id, topic_id, type, title, video_url) values
  ('80a00000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','70a00000-0000-0000-0000-000000000000','video','V','https://x');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"51515151-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.content_progress (user_id, content_item_id) values
      ('51515151-0000-0000-0000-000000000000','80a00000-0000-0000-0000-000000000000');
    raise exception 'E1 FAIL: revoked member recorded progress';
  exception when insufficient_privilege then insert into _results (msg) values ('E1 PASS (RLS denied)');
  end;
end $$;
reset role;


-- =============================================================================
-- SECTION F — [R1] composite-FK fail-closed (cross-teacher spine references)
-- =============================================================================
-- These run as the OWNER (RLS bypassed) to prove the FK — not RLS — is the guard.
set local role postgres;

-- F1. A weekly channel cannot point at teacher B's month (composite FK).
do $$
begin
  begin
    insert into public.channels (teacher_id, slug, name, section, week_number, group_id) values
      ('aaaaaaaa-0000-0000-0000-000000000000','week-x','Week X','weekly',1,
       '46000000-0000-0000-0000-000000000001');  -- B's month
    raise exception 'F1 FAIL: created A week pointing at B month';
  exception when foreign_key_violation then insert into _results (msg) values ('F1 PASS (composite FK fail-closed)');
  end;
end $$;

-- F2. A recording cannot live in teacher B's folder (composite FK).
do $$
begin
  begin
    insert into public.classroom_recordings (teacher_id, folder_id, title) values
      ('aaaaaaaa-0000-0000-0000-000000000000','f0b00000-0000-0000-0000-000000000000','R');  -- B's folder
    raise exception 'F2 FAIL: A recording in B folder';
  exception when foreign_key_violation then insert into _results (msg) values ('F2 PASS (composite FK fail-closed)');
  end;
end $$;

-- F3. A content_item cannot reference teacher B's topic (composite FK).
do $$
begin
  begin
    insert into public.content_items (teacher_id, topic_id, type, title, video_url) values
      ('bbbbbbbb-0000-0000-0000-000000000000','70a00000-0000-0000-0000-000000000000','video','X','https://x'); -- A's topic, B teacher
    raise exception 'F3 FAIL: B content_item on A topic';
  exception when foreign_key_violation then insert into _results (msg) values ('F3 PASS (composite FK fail-closed)');
  end;
end $$;

-- F4. SELF-REFERENTIAL: a child folder cannot adopt a parent from another teacher.
--     classroom_folders_parent_same_teacher_fkey is DEFERRABLE INITIALLY DEFERRED, so
--     the violation is NOT raised at the INSERT and would slide until a commit that
--     never happens in this rolled-back harness. We therefore force the check with
--     SET CONSTRAINTS … IMMEDIATE *inside* the begin/exception block and catch the
--     23503 from that. The exception aborts this subtransaction, rolling back BOTH the
--     bad row AND the immediate-mode change (so F5 below is unaffected). VERIFIED on a
--     scratch DB: the forced check raises a catchable foreign_key_violation.
do $$
begin
  begin
    insert into public.classroom_folders (teacher_id, name, parent_folder_id) values
      ('aaaaaaaa-0000-0000-0000-000000000000','Child','f0b00000-0000-0000-0000-000000000000'); -- B parent
    -- Force the deferred constraint to validate NOW (this is what raises 23503):
    set constraints public.classroom_folders_parent_same_teacher_fkey immediate;
    raise exception 'F4 FAIL: A child folder adopted a B parent (no violation on forced check)';
  exception when foreign_key_violation then
    insert into _results (msg) values ('F4 PASS (cross-teacher self composite FK fail-closed at forced check)');
  end;
end $$;

-- Belt-and-suspenders: guarantee F5 runs under DEFERRED mode regardless of F4's
-- mode juggling (the aborted subtransaction above should already have reverted it).
set constraints all deferred;

-- F5. Insert-ordering check for the DEFERRABLE self-FK: a valid SAME-teacher tree
--     can be seeded child-before-parent within one txn (deferred check passes when the
--     parent exists by the time the constraint is validated). Must NOT force-immediate
--     here — that would break the legitimate out-of-order ordering. The matched pair to
--     F4: F4 proves the deferred FK REJECTS cross-teacher; F5 proves it ACCEPTS
--     valid-but-out-of-order.
do $$
begin
  insert into public.classroom_folders (id, teacher_id, name, parent_folder_id) values
    ('f0a00000-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-000000000000','Child first',
     'f0a00000-0000-0000-0000-0000000000d1'),                                   -- parent not yet inserted
    ('f0a00000-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000000','Parent after', null);
  -- Force validation now to confirm the SAME-teacher tree is accepted (no 23503):
  set constraints public.classroom_folders_parent_same_teacher_fkey immediate;
  insert into _results (msg) values ('F5 PASS (deferrable self-FK accepts valid child-before-parent in one txn)');
exception when foreign_key_violation then
  raise exception 'F5 FAIL: legitimate same-teacher out-of-order tree was rejected';
end $$;

-- Reset to deferred so the final ROLLBACK (and any later block) is unaffected.
set constraints all deferred;

reset role;


-- =============================================================================
-- SECTION G — [R3] profiles has nothing privilege-bearing to escalate into
-- =============================================================================

-- G1. authenticated CANNOT write memberships at all (no write policy → default deny).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.memberships (profile_id, teacher_id, role, status) values
      ('11111111-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','admin','active');
    raise exception 'G1 FAIL: self-granted admin membership';
  exception when insufficient_privilege then insert into _results (msg) values ('G1 PASS (membership write denied)');
  end;
end $$;

-- G2. authenticated CANNOT promote an existing membership to admin (no UPDATE policy).
do $$
begin
  begin
    update public.memberships set role = 'admin'
      where profile_id = '11111111-0000-0000-0000-000000000000';
    -- An UPDATE blocked by RLS affects 0 rows silently rather than erroring; assert that.
    if found then raise exception 'G2 FAIL: membership UPDATE affected rows'; end if;
    insert into _results (msg) values ('G2 PASS (membership UPDATE affected 0 rows)');
  exception when insufficient_privilege then insert into _results (msg) values ('G2 PASS (membership UPDATE denied)');
  end;
end $$;

-- G3. authenticated CANNOT set deleted_at on its own profile (column not in GRANT).
--     This is the PRIMARY [R3] defense — a column-level privilege error, not RLS.
do $$
begin
  begin
    update public.profiles set deleted_at = now() where id = '11111111-0000-0000-0000-000000000000';
    raise exception 'G3 FAIL: self-set deleted_at succeeded';
  exception when insufficient_privilege then insert into _results (msg) values ('G3 PASS (column GRANT blocked deleted_at)');
  end;
end $$;

-- G4. authenticated CAN update its own allowed columns (sanity — not over-locked).
do $$
begin
  update public.profiles set display_name = 'Renamed', bio = 'hi'
    where id = '11111111-0000-0000-0000-000000000000';
  if not found then raise exception 'G4 FAIL: own allowed-column update affected 0 rows'; end if;
  insert into _results (msg) values ('G4 PASS (allowed columns still self-editable)');
end $$;

-- G5. authenticated CANNOT update someone else's profile row.
do $$
begin
  update public.profiles set display_name = 'hijack'
    where id = '21212121-0000-0000-0000-000000000000';
  if found then raise exception 'G5 FAIL: updated another user profile'; end if;
  insert into _results (msg) values ('G5 PASS (cannot edit other profiles)');
end $$;
reset role;


-- =============================================================================
-- SECTION H — profiles visibility scoping (cross-tenant member directory)
-- =============================================================================
-- H1. A-member sees A co-members (+ self) but NOT B-only members.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  -- visible: A member(self), A admin, dual (shares A), A revoked (target need not be active). NOT B member, NOT no-member.
  if (select count(*) from public.profiles where id = '21212121-0000-0000-0000-000000000000') <> 0
     then raise exception 'H1 FAIL: A-member saw B-only member'; end if;
  if (select count(*) from public.profiles where id = '41414141-0000-0000-0000-000000000000') <> 0
     then raise exception 'H1 FAIL: A-member saw a no-member profile'; end if;
  if (select count(*) from public.profiles where id = '51515151-0000-0000-0000-000000000000') <> 1
     then raise exception 'H1 FAIL: tombstone/revoked co-member not visible (breaks [Deleted user] rendering)'; end if;
  insert into _results (msg) values ('H1 PASS');
end $$;
reset role;


-- =============================================================================
-- SECTION K — [Phase 2] open teacher directory is SURGICAL
-- =============================================================================
-- After REPLACING teachers_select_member with teachers_select_all (USING(true)),
-- ANY authenticated user reads the teacher directory, but content stays locked
-- behind has_membership(teacher_id). Proves the widening leaked NO content.
-- (content_items row 80a for teacher A was seeded in Section E above.)

-- K1. A no-membership user (u_none) sees BOTH teachers but ZERO content rows.
set local role authenticated;
set local request.jwt.claims = '{"sub":"41414141-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.teachers
        where id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 2
     then raise exception 'K1 FAIL: directory not open to a non-member'; end if;
  if (select count(*) from public.posts
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 0
     then raise exception 'K1 FAIL: non-member saw posts'; end if;
  if (select count(*) from public.channels
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 0
     then raise exception 'K1 FAIL: non-member saw channels'; end if;
  if (select count(*) from public.content_items
        where teacher_id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 0
     then raise exception 'K1 FAIL: non-member saw content_items'; end if;
  insert into _results (msg) values ('K1 PASS (open directory, content stays locked)');
end $$;
reset role;

-- K2. A B-member sees the full directory (2 teachers) but still ZERO of teacher A's
--     content — proving the widening did not become a cross-teacher content path.
set local role authenticated;
set local request.jwt.claims = '{"sub":"21212121-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.teachers
        where id in ('aaaaaaaa-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000')) <> 2
     then raise exception 'K2 FAIL: B-member cannot see the full directory'; end if;
  if (select count(*) from public.posts where teacher_id = 'aaaaaaaa-0000-0000-0000-000000000000') <> 0
     then raise exception 'K2 FAIL: B-member saw A posts'; end if;
  if (select count(*) from public.channels where teacher_id = 'aaaaaaaa-0000-0000-0000-000000000000') <> 0
     then raise exception 'K2 FAIL: B-member saw A channels'; end if;
  if (select count(*) from public.content_items where teacher_id = 'aaaaaaaa-0000-0000-0000-000000000000') <> 0
     then raise exception 'K2 FAIL: B-member saw A content'; end if;
  insert into _results (msg) values ('K2 PASS (full directory, A content still hidden from B)');
end $$;
reset role;


-- =============================================================================
-- SECTION J — [Item 3] post_videos: admin manages video on ANY post in their teacher
-- =============================================================================
-- NOTE on fixtures: post 40a is authored by the A-MEMBER (11111111), while the actor
-- in J1/J2 is the A-ADMIN (12121212) — a GENUINELY DIFFERENT author. This is what
-- exercises the cross-author path; a same-author test would have passed under the old
-- author-AND-admin policy and proven nothing.

-- J0. A non-admin member CANNOT attach a video, even to their OWN post (admin-only).
--     Runs first, while post 40a still has no video row.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  begin
    insert into public.post_videos (post_id, video_id, video_provider, video_status) values
      ('40a00000-0000-0000-0000-000000000000','vid-member','bunny','processing');
    raise exception 'J0 FAIL: non-admin attached a video';
  exception when insufficient_privilege then insert into _results (msg) values ('J0 PASS (non-admin video write denied)');
  end;
end $$;
reset role;

-- J1. A-ADMIN attaches a video to the A-MEMBER's post (same teacher, cross-author) → OK.
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-0000-0000-0000-000000000000","role":"authenticated"}';
do $$
begin
  insert into public.post_videos (post_id, video_id, video_provider, video_status) values
    ('40a00000-0000-0000-0000-000000000000','vid-admin','bunny','processing');
  insert into _results (msg) values ('J1 PASS (admin manages another member''s video, same teacher)');
end $$;

-- J2. Same A-admin CANNOT attach a video to teacher B's post (is_teacher_admin(B)=false).
do $$
begin
  begin
    insert into public.post_videos (post_id, video_id, video_provider, video_status) values
      ('40b00000-0000-0000-0000-000000000000','vid-cross','bunny','processing');
    raise exception 'J2 FAIL: A-admin attached a video to a B post';
  exception when insufficient_privilege then insert into _results (msg) values ('J2 PASS (cross-teacher admin denied)');
  end;
end $$;
reset role;


-- =============================================================================
-- SECTION I — [Item 1] anon cannot write (no table grant + no policy)
-- =============================================================================
-- This is the gap that let the wide-open anon grant slip in: the rest of the suite
-- passes even if anon write is granted, because it only tests authenticated users.
set local role anon;   -- no request.jwt.claims → unauthenticated (auth.uid() is null)

-- I1. anon cannot insert a post.
do $$
begin
  begin
    insert into public.posts (teacher_id, author_id, body) values
      ('aaaaaaaa-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000000','anon');
    raise exception 'I1 FAIL: anon inserted a post';
  exception when insufficient_privilege then insert into _results (msg) values ('I1 PASS (anon write denied)');
  end;
end $$;

-- I2. anon cannot insert a membership (the most sensitive table).
do $$
begin
  begin
    insert into public.memberships (profile_id, teacher_id, role, status) values
      ('11111111-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','admin','active');
    raise exception 'I2 FAIL: anon inserted a membership';
  exception when insufficient_privilege then insert into _results (msg) values ('I2 PASS (anon membership write denied)');
  end;
end $$;

-- I3. anon cannot even SELECT (no anon grant; every policy is TO authenticated).
do $$
begin
  begin
    perform 1 from public.posts limit 1;
    raise exception 'I3 FAIL: anon read posts';
  exception when insufficient_privilege then insert into _results (msg) values ('I3 PASS (anon read denied)');
  end;
end $$;
reset role;


-- =============================================================================
-- RESULTS GRID — emit every PASS row. MUST run before ROLLBACK (the temp table is
-- dropped by the rollback). A clean run returns one row per PASS below; any failure
-- would have aborted earlier via raise exception.
-- =============================================================================
select msg from _results order by seq;


-- =============================================================================
-- Cleanup — never persist test data.
-- =============================================================================
rollback;

-- =============================================================================
-- NOT yet covered here (intentionally — call out, don't silently skip):
--   • Storage object policies: assert insert/select/delete under each role with
--     {teacher_id}/{uid}/... paths, including the malformed-teacher-segment cast
--     rejection and the ACCEPTED content-files public-URL gap [D4]. Storage tests
--     need the storage schema + buckets seeded, so they live in a companion script.
--   • PostgREST embed regression: re-run the lib/posts.ts embeds against this schema
--     to confirm author:profiles!author_id / user:profiles!user_id still resolve once
--     memberships→profiles exists (FK hints must remain). This is an app-layer check,
--     not pure SQL.
-- =============================================================================
-- End of PROPOSAL_test_matrix.sql — REVIEW ONLY. Do not run until approved.
-- =============================================================================
