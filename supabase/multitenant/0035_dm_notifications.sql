-- 0035_dm_notifications.sql — notify the recipient of a direct message (MT).
--
-- Reuses the notifications machinery (bell + realtime + the notifications-INSERT
-- Database Webhook → /api/push/send). Adds a 'direct_message' type and a thread_id
-- column so the notification can deep-link to /t/<slug>/messages/<thread>. send_dm
-- (0034) now also inserts one notification for the other participant.
--
-- Idempotent: safe to re-run.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array['mention','mention_all','post_comment','post_like','comment_like','event_reminder','direct_message'])
);

alter table public.notifications add column if not exists thread_id uuid;
alter table public.notifications drop constraint if exists notifications_thread_fkey;
alter table public.notifications add constraint notifications_thread_fkey
  foreign key (thread_id) references public.dm_threads(id) on delete cascade;

-- send_dm + notify the recipient. Same body as 0034, plus the notification insert.
create or replace function public.send_dm(p_thread uuid, p_body text)
returns public.dm_messages language plpgsql security definer set search_path to 'public'
as $$
declare v_msg public.dm_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.dm_threads t
                 where t.id = p_thread and auth.uid() in (t.user_a, t.user_b)) then
    raise exception 'not_participant';
  end if;
  if char_length(coalesce(trim(p_body), '')) = 0 then raise exception 'empty_body'; end if;

  insert into public.dm_messages (thread_id, sender_id, body)
  values (p_thread, auth.uid(), trim(p_body)) returning * into v_msg;

  update public.dm_threads set last_message_at = now() where id = p_thread;

  -- Notify the OTHER participant (bell + realtime + web push via the webhook).
  insert into public.notifications (teacher_id, recipient_id, actor_id, type, thread_id)
  select t.teacher_id,
         case when t.user_a = auth.uid() then t.user_b else t.user_a end,
         auth.uid(), 'direct_message', t.id
  from public.dm_threads t
  where t.id = p_thread;

  return v_msg;
end;
$$;

-- Realtime for the open DM thread (RLS still scopes each subscriber to their own
-- threads). Safe to run repeatedly.
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
