-- =====================================================================
-- 0015_teacher_website.sql
-- teachers.website_url — an OPTIONAL outbound marketing link.
--
-- USE: the /home directory shows a "locked community" info modal to anyone who is
-- NOT a member (logged-out visitors AND logged-in non-members). The modal shows the
-- teacher's description and, when set, a "Visit website" button linking here. It is
-- NOT the in-app request-to-join flow (that stays untouched) — it is a pure outbound
-- link for people who must enroll/pay on the teacher's own site.
--
-- PUBLIC BY DESIGN: the modal renders for anon, so website_url must be anon-readable.
-- It is added to the SAME narrow anon column-select grant as the other directory
-- columns (0002). Nullable, no backfill — a teacher with no link renders no button.
--
-- authenticated already reads every teachers column via its table-level grant +
-- teachers_select_all RLS, so no authenticated grant change is needed. No RLS policy
-- change: teachers_update_admin already gates writes to admins of that teacher.
--
-- TIER 1 (additive column + one anon column-grant extension). Hand-run on
-- community-mt-dev, then reconcile into supabase/multitenant/schema.sql. Re-runnable.
-- =====================================================================

alter table public.teachers
  add column if not exists website_url text;

-- Extend the anon SELECT to expose website_url (additive — column grants union with
-- the existing 0002 grant; the other directory columns stay granted).
grant select (website_url) on public.teachers to anon;

-- End of 0015. Run ONCE in the SQL editor on community-mt-dev, then reconcile the
-- column + the extended anon grant into supabase/multitenant/schema.sql.
