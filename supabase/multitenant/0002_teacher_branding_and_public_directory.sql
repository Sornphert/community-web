-- =============================================================================
-- 0002_teacher_branding_and_public_directory.sql — MT home redesign, backend batch
-- =============================================================================
-- Backend prerequisites for the teacher-DIRECTORY home page. Standalone, hand-run
-- in the Supabase SQL editor on community-mt-dev (no CLI migration tooling). Safe
-- to re-run: every object is guarded (add column if not exists / on conflict do
-- nothing / drop policy if exists / create or replace).
--
--   A. teachers branding columns (cover_url, logo_url, description) — all NULLABLE
--      for now; backfill + SET NOT NULL is a LATER migration.
--   B. teacher-covers + teacher-logos storage buckets — copy the topic-covers
--      pattern verbatim: public-read bucket, admin-only write gated on segment[1]
--      = teacher_id via is_teacher_admin. Path convention {teacherId}/...
--   C. avatars bucket RLS realign — drop the teacher_id/has_membership write gate
--      (a scrapped-feature leftover) so the existing profile-form.tsx {uid}/avatar.jpg
--      path validates with NO component edit. Read stays public.
--   D. teacher_member_counts() RPC — SECURITY DEFINER aggregate (no PII) so the
--      Discover cards can show counts to non-member AND logged-out viewers (the
--      memberships RLS hides rows from them). Mirrors has_membership posture.
--   E. Public (anon) teachers read — anon SELECT policy + column-scoped grant for
--      the logged-out directory. created_at is intentionally NOT exposed to anon.
--
-- NOTE on "public read" for buckets B: like every existing bucket, the SELECT
-- policy is `to authenticated`, but the bucket's public=true flag is what serves
-- the object via getPublicUrl — so logged-out directory visitors still render the
-- cover/logo images. (Same mechanism as avatars/topic-covers today.)
-- =============================================================================


-- =============================================================================
-- A — teachers branding columns (nullable; backfill + NOT NULL is a later migration)
-- =============================================================================
alter table public.teachers
  add column if not exists cover_url   text,
  add column if not exists logo_url    text,
  add column if not exists description text;


-- =============================================================================
-- B — teacher-covers + teacher-logos buckets (copy of topic-covers, verbatim)
-- =============================================================================
-- Bucket rows mirror topic-covers in seed.sql: public-read, 2 MB limit, null MIME
-- (admins upload JPEG via convertToJpg; the storage RLS is the real gate).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('teacher-covers', 'teacher-covers', true, 2097152, null),
  ('teacher-logos',  'teacher-logos',  true, 2097152, null)
on conflict (id) do nothing;

-- teacher-covers ({teacher_id}/...) — admin write, member/public read. Segment[1]
-- = teacher_id is load-bearing for the write check (cosmetic {uid} may follow).
drop policy if exists teacher_covers_select on storage.objects;
create policy teacher_covers_select on storage.objects for select to authenticated using (bucket_id = 'teacher-covers');
drop policy if exists teacher_covers_insert_admin on storage.objects;
create policy teacher_covers_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'teacher-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_covers_update_admin on storage.objects;
create policy teacher_covers_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'teacher-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_covers_delete_admin on storage.objects;
create policy teacher_covers_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));

-- teacher-logos ({teacher_id}/...) — identical posture.
drop policy if exists teacher_logos_select on storage.objects;
create policy teacher_logos_select on storage.objects for select to authenticated using (bucket_id = 'teacher-logos');
drop policy if exists teacher_logos_insert_admin on storage.objects;
create policy teacher_logos_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'teacher-logos' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_logos_update_admin on storage.objects;
create policy teacher_logos_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'teacher-logos' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_logos_delete_admin on storage.objects;
create policy teacher_logos_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-logos' and is_teacher_admin(((storage.foldername(name))[1])::uuid));


-- =============================================================================
-- C — avatars bucket RLS realign (own-uid only; drop the teacher_id gate)
-- =============================================================================
-- BEFORE (this migration replaces these): write gated on
--   has_membership((foldername)[1]::uuid) AND (foldername)[2] = auth.uid()::text
-- i.e. the {teacher_id}/{uid}/avatar.jpg layout from a scrapped feature.
-- AFTER: write gated ONLY on (foldername)[1] = auth.uid()::text, so the existing
-- profile-form.tsx {uid}/avatar.jpg path is valid platform-wide with no teacher
-- context. avatars_select (public read) is intentionally left UNCHANGED.
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- =============================================================================
-- D — teacher_member_counts() RPC (aggregate only; no PII)
-- =============================================================================
-- Returns one row per teacher with >=1 active member. SECURITY DEFINER so it
-- bypasses memberships RLS (which hides co-member rows from non-members/anon),
-- but it returns ONLY (teacher_id, count) — never profile_id or any PII. Teachers
-- with zero active members are simply absent (the app treats missing as 0).
create or replace function public.teacher_member_counts()
returns table(teacher_id uuid, member_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.teacher_id, count(*)::bigint as member_count
  from public.memberships m
  where m.status = 'active'
  group by m.teacher_id;
$$;

-- Mirror has_membership's grant posture (anon + authenticated + service_role).
grant execute on function public.teacher_member_counts() to anon, authenticated, service_role;


-- =============================================================================
-- E — public (anon) teachers read for the logged-out directory
-- =============================================================================
-- New anon-only SELECT policy; the existing authenticated teachers_select_all is
-- left untouched. The column-scoped grant is the hard boundary on what anon can
-- read — created_at and any future column are NOT exposed to anon.
drop policy if exists teachers_select_anon on public.teachers;
create policy teachers_select_anon on public.teachers for select to anon using (true);

grant select (id, slug, name, cover_url, logo_url, description) on public.teachers to anon;


-- =============================================================================
-- End of 0002. Run ONCE in the SQL editor on community-mt-dev.
-- =============================================================================
