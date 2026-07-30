-- =====================================================================
-- 0041_content_reports.sql   (MULTI-TENANT)
-- Member-submitted reports of a post, comment, or user, surfaced to the
-- teacher's admins in a review queue. Table-stakes moderation.
--
-- DESIGN — POLYMORPHIC TARGET (no FK on target_id). target_id is a plain uuid
-- keyed by target_type ('post'|'comment'|'user'). This is deliberate: a real FK
-- from content_reports to posts/comments would make PostgREST treat those parents
-- as many-to-many with profiles (the PGRST201 junction-ambiguity trap documented in
-- CLAUDE.md), silently breaking existing author:profiles embeds. With no such FK,
-- content_reports only relates to profiles (reporter_id, resolved_by) and teachers —
-- so it cannot perturb any posts/comments embed. The admin fetcher resolves target
-- previews with follow-up queries instead of an embed.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.content_reports (
    id           uuid primary key default gen_random_uuid(),
    teacher_id   uuid not null,
    reporter_id  uuid not null,
    target_type  text not null,
    target_id    uuid not null,
    reason       text,
    status       text not null default 'open',
    resolved_by  uuid,
    resolved_at  timestamptz,
    created_at   timestamptz not null default now(),
    constraint content_reports_teacher_fkey  foreign key (teacher_id)  references public.teachers(id)  on delete cascade,
    constraint content_reports_reporter_fkey foreign key (reporter_id) references public.profiles(id)  on delete cascade,
    constraint content_reports_resolver_fkey foreign key (resolved_by) references public.profiles(id)  on delete set null,
    constraint content_reports_target_type_check check (target_type = any (array['post','comment','user'])),
    constraint content_reports_status_check      check (status = any (array['open','actioned','dismissed'])),
    constraint content_reports_reason_check      check (reason is null or char_length(reason) <= 1000)
);

-- Queue lookups are always (teacher, status).
create index if not exists content_reports_teacher_status_idx
  on public.content_reports (teacher_id, status);

-- One OPEN report per (reporter, target): re-reporting the same thing is idempotent
-- while a prior report is still open; once resolved, a member may report again.
create unique index if not exists content_reports_unique_open
  on public.content_reports (reporter_id, target_type, target_id)
  where status = 'open';

alter table public.content_reports enable row level security;

-- SELECT: the teacher's admins see the whole queue; a reporter can see their own rows.
drop policy if exists content_reports_select on public.content_reports;
create policy content_reports_select on public.content_reports
  for select to authenticated
  using (is_teacher_admin(teacher_id) or reporter_id = auth.uid());

-- INSERT: an active member of the teacher files a report as themselves.
drop policy if exists content_reports_insert_own on public.content_reports;
create policy content_reports_insert_own on public.content_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and has_membership(teacher_id));

-- UPDATE: admins only (resolve / dismiss). No member self-edit.
drop policy if exists content_reports_update_admin on public.content_reports;
create policy content_reports_update_admin on public.content_reports
  for update to authenticated
  using (is_teacher_admin(teacher_id))
  with check (is_teacher_admin(teacher_id));

grant select, insert, update on public.content_reports to authenticated, service_role;
revoke all on public.content_reports from anon;
