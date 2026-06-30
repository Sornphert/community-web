-- =============================================================================
-- 0003_teachers_admin_update_policy.sql — teachers admin UPDATE policy
-- =============================================================================
-- 0002 added teachers.cover_url/logo_url/description (+ branding buckets) but NO
-- UPDATE policy on public.teachers. RLS default-denies, so the branding admin
-- action's `update teachers ... where id = teacherId` passed its app-layer
-- requireTeacherAdmin guard yet matched 0 rows at the RLS layer — a silent no-op.
-- This adds the missing policy: an active admin of THE teacher (is_teacher_admin(id),
-- where id is the teachers PK) may UPDATE that row. Standalone, hand-run in the SQL
-- editor; the identical policy is folded into multitenant/schema.sql Section 8.
-- =============================================================================

drop policy if exists teachers_update_admin on public.teachers;
create policy teachers_update_admin on public.teachers for update to authenticated
  using (is_teacher_admin(id)) with check (is_teacher_admin(id));

-- =============================================================================
-- End of 0003. Run ONCE in the SQL editor on community-mt-dev.
-- =============================================================================
