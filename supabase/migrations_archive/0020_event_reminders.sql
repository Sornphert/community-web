-- Scheduled event reminders (WEB + push)
-- Run in the Supabase SQL editor on BOTH projects (Johnson + Bootcamp).
-- Idempotent: safe to re-run.
--
-- Sends every member an in-app notification (and, via the existing notifications
-- Database Webhook → /api/push/send, an OS push) at THREE lead times before an
-- event: ~24h, ~8h, and ~1h before it starts. Each fires at most once.
--
-- WHY pg_cron (not Vercel Cron): the site is on Vercel's Hobby tier, whose cron
-- runs at most once per day — far too coarse. pg_cron runs inside Postgres every
-- few minutes for free, inserting notification rows exactly like the mention/like
-- triggers do, so the SAME webhook delivers the push — no new endpoint required.
--
-- WINDOWS (disjoint, so a cron tick fires at most one reminder per event):
--   24h reminder: event starts in (8h, 24h]  and 24h not yet sent
--    8h reminder: event starts in (1h,  8h]  and  8h not yet sent
--    1h reminder: event starts in (0,   1h]  and  1h not yet sent
-- An event created late (e.g. 2h before start) simply skips the milestones whose
-- window has already passed — it won't get a bogus "24h" reminder.

-- ---------------------------------------------------------------------------
-- 1. Schema: new notification type + event link + per-milestone dedupe stamps.
-- ---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type = any (array[
      'mention','mention_all','post_comment','post_like','comment_like','event_reminder'
    ])
  );

alter table public.notifications
  add column if not exists event_id uuid;
do $$
begin
  alter table public.notifications
    add constraint notifications_event_id_fkey
    foreign key (event_id) references public.events(id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists reminded_24h_at timestamptz,
  add column if not exists reminded_8h_at  timestamptz,
  add column if not exists reminded_1h_at  timestamptz;

-- ---------------------------------------------------------------------------
-- 2. The reminder function. SECURITY DEFINER so it can insert notifications
--    (which have NO authenticated INSERT policy). One row per (member, event)
--    per milestone; tombstoned users excluded.
-- ---------------------------------------------------------------------------
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
    select id from public.events
    where reminded_24h_at is null
      and starts_at > now() + interval '8 hours'
      and starts_at <= now() + interval '24 hours'
    for update skip locked
  loop
    insert into public.notifications (recipient_id, type, event_id)
    select p.id, 'event_reminder', v_event.id
    from public.profiles p where p.deleted_at is null;
    update public.events set reminded_24h_at = now() where id = v_event.id;
  end loop;

  -- 8h before
  for v_event in
    select id from public.events
    where reminded_8h_at is null
      and starts_at > now() + interval '1 hour'
      and starts_at <= now() + interval '8 hours'
    for update skip locked
  loop
    insert into public.notifications (recipient_id, type, event_id)
    select p.id, 'event_reminder', v_event.id
    from public.profiles p where p.deleted_at is null;
    update public.events set reminded_8h_at = now() where id = v_event.id;
  end loop;

  -- 1h before
  for v_event in
    select id from public.events
    where reminded_1h_at is null
      and starts_at > now()
      and starts_at <= now() + interval '1 hour'
    for update skip locked
  loop
    insert into public.notifications (recipient_id, type, event_id)
    select p.id, 'event_reminder', v_event.id
    from public.profiles p where p.deleted_at is null;
    update public.events set reminded_1h_at = now() where id = v_event.id;
  end loop;
end;
$$;

grant execute on function public.send_event_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Schedule it every 10 minutes via pg_cron.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'event-reminders') then
    perform cron.unschedule('event-reminders');
  end if;
  perform cron.schedule(
    'event-reminders',
    '*/10 * * * *',
    $cron$select public.send_event_reminders()$cron$
  );
end $$;
