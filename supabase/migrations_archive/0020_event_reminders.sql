-- Scheduled event reminders (WEB + push)
-- Run in the Supabase SQL editor on BOTH projects (Johnson + Bootcamp).
-- Idempotent: safe to re-run.
--
-- Sends every member an in-app notification (and, via the existing notifications
-- Database Webhook → /api/push/send, an OS push) shortly before an event starts.
--
-- WHY pg_cron (not Vercel Cron): the site is on Vercel's Hobby tier, whose cron
-- runs at most once per day — far too coarse for "remind ~1h before". pg_cron runs
-- inside Postgres every few minutes for free. It inserts notification rows exactly
-- like the mention/like triggers do, so the SAME webhook delivers the push — no new
-- endpoint required.
--
-- LEAD TIME: an event is reminded once, when it is within REMINDER_LEAD of starting
-- (default 60 min) and not already reminded (events.reminder_sent_at). Past events
-- and already-reminded events are skipped.

-- ---------------------------------------------------------------------------
-- 1. Schema: new notification type + event link + a per-event dedupe stamp.
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
  add column if not exists reminder_sent_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. The reminder function. SECURITY DEFINER so it can insert notifications
--    (which have NO authenticated INSERT policy — same as the trigger authors).
--    One row per (member, event); tombstoned users excluded. Marks the event
--    reminded so it never double-fires.
-- ---------------------------------------------------------------------------
create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead interval := interval '60 minutes';
  v_event record;
begin
  for v_event in
    select id
    from public.events
    where reminder_sent_at is null
      and starts_at > now()
      and starts_at <= now() + v_lead
    for update skip locked
  loop
    insert into public.notifications (recipient_id, type, event_id)
    select p.id, 'event_reminder', v_event.id
    from public.profiles p
    where p.deleted_at is null;

    update public.events
      set reminder_sent_at = now()
      where id = v_event.id;
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
