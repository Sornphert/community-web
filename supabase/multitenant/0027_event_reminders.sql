-- =====================================================================
-- 0027_event_reminders.sql   (MULTI-TENANT)
-- Scheduled event reminders: in-app notification + push at ~24h, ~8h and ~1h
-- before an event starts. Ports the single-tenant 0020, teacher-scoped.
--
-- Each event belongs to a teacher; a reminder goes only to that teacher's ACTIVE,
-- non-tombstoned members, and the notification carries the event's teacher_id (so
-- it renders in the right community's bell + push, reusing the existing
-- notifications → /api/push/send webhook). pg_cron drives it (Vercel Hobby cron is
-- daily-only). Three disjoint windows, each fires once per event.
--
-- Standalone, hand-run in the Supabase SQL editor, then reconciled into schema.sql.
-- Idempotent: re-run on any error.
-- =====================================================================

-- 1. New notification type + event link + per-milestone dedupe stamps.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'mention','mention_all','post_comment','post_like','comment_like','event_reminder'
  ])
);

alter table public.notifications add column if not exists event_id uuid;
do $$
begin
  alter table public.notifications
    add constraint notifications_event_id_fkey
    foreign key (event_id) references public.events(id) on delete cascade;
exception when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists reminded_24h_at timestamptz,
  add column if not exists reminded_8h_at  timestamptz,
  add column if not exists reminded_1h_at  timestamptz;

-- 2. The reminder function. SECURITY DEFINER (notifications has no authenticated
--    INSERT policy). Per event, notify that teacher's ACTIVE non-tombstoned members.
create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  -- 24h before
  for v_event in
    select id, teacher_id from public.events
    where reminded_24h_at is null
      and starts_at > now() + interval '8 hours'
      and starts_at <= now() + interval '24 hours'
    for update skip locked
  loop
    insert into public.notifications (teacher_id, recipient_id, type, event_id)
    select v_event.teacher_id, m.profile_id, 'event_reminder', v_event.id
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.teacher_id = v_event.teacher_id and m.status = 'active'
      and p.deleted_at is null;
    update public.events set reminded_24h_at = now() where id = v_event.id;
  end loop;

  -- 8h before
  for v_event in
    select id, teacher_id from public.events
    where reminded_8h_at is null
      and starts_at > now() + interval '1 hour'
      and starts_at <= now() + interval '8 hours'
    for update skip locked
  loop
    insert into public.notifications (teacher_id, recipient_id, type, event_id)
    select v_event.teacher_id, m.profile_id, 'event_reminder', v_event.id
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.teacher_id = v_event.teacher_id and m.status = 'active'
      and p.deleted_at is null;
    update public.events set reminded_8h_at = now() where id = v_event.id;
  end loop;

  -- 1h before
  for v_event in
    select id, teacher_id from public.events
    where reminded_1h_at is null
      and starts_at > now()
      and starts_at <= now() + interval '1 hour'
    for update skip locked
  loop
    insert into public.notifications (teacher_id, recipient_id, type, event_id)
    select v_event.teacher_id, m.profile_id, 'event_reminder', v_event.id
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.teacher_id = v_event.teacher_id and m.status = 'active'
      and p.deleted_at is null;
    update public.events set reminded_1h_at = now() where id = v_event.id;
  end loop;
end;
$$;

grant execute on function public.send_event_reminders() to service_role;

-- 3. Schedule every 10 minutes via pg_cron.
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'event-reminders') then
    perform cron.unschedule('event-reminders');
  end if;
  perform cron.schedule('event-reminders', '*/10 * * * *',
    $cron$select public.send_event_reminders()$cron$);
end $$;
