-- 0034_direct_messages.sql — 1:1 direct messages between members (MT).
--
-- Scope: SAME-COMMUNITY members only. A DM thread is scoped to a teacher; it can
-- exist only between two ACTIVE members of that teacher. A member who belongs to
-- several communities has a separate thread per community with the same person.
--
-- The pair is canonicalized (user_a < user_b) with a UNIQUE(teacher_id, user_a,
-- user_b) so there is exactly one thread per (community, pair). Read state is two
-- per-thread "last read" timestamps (one per participant). All writes go through
-- SECURITY DEFINER RPCs (create thread / send / mark read) which enforce the
-- co-membership rule; the tables themselves grant only SELECT to clients.
--
-- Idempotent: safe to re-run.

create table if not exists public.dm_threads (
    id                  uuid primary key default gen_random_uuid(),
    teacher_id          uuid not null,
    user_a              uuid not null,
    user_b              uuid not null,
    user_a_last_read_at timestamptz,
    user_b_last_read_at timestamptz,
    last_message_at     timestamptz default now(),
    created_at          timestamptz default now(),
    constraint dm_threads_pair_order check (user_a < user_b),
    constraint dm_threads_unique unique (teacher_id, user_a, user_b),
    constraint dm_threads_teacher_fkey foreign key (teacher_id) references public.teachers(id) on delete cascade,
    constraint dm_threads_user_a_fkey  foreign key (user_a)     references public.profiles(id) on delete cascade,
    constraint dm_threads_user_b_fkey  foreign key (user_b)     references public.profiles(id) on delete cascade
);
create index if not exists dm_threads_user_a_idx on public.dm_threads (user_a, last_message_at desc);
create index if not exists dm_threads_user_b_idx on public.dm_threads (user_b, last_message_at desc);

create table if not exists public.dm_messages (
    id         uuid primary key default gen_random_uuid(),
    thread_id  uuid not null,
    sender_id  uuid not null,
    body       text not null,
    created_at timestamptz default now(),
    constraint dm_messages_body_check check (char_length(body) between 1 and 4000),
    constraint dm_messages_thread_fkey foreign key (thread_id) references public.dm_threads(id) on delete cascade,
    constraint dm_messages_sender_fkey foreign key (sender_id) references public.profiles(id)   on delete cascade
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at);

alter table public.dm_threads  enable row level security;
alter table public.dm_messages enable row level security;

-- SELECT only: participants read their own threads + messages. All writes go through
-- the RPCs below (SECURITY DEFINER), so there are no client INSERT/UPDATE policies.
drop policy if exists dm_threads_select on public.dm_threads;
create policy dm_threads_select on public.dm_threads for select to authenticated
  using (auth.uid() in (user_a, user_b));
drop policy if exists dm_messages_select on public.dm_messages;
create policy dm_messages_select on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_threads t
                 where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)));

-- Open or create the thread between the caller and p_other within teacher p_teacher.
-- Enforces the co-membership rule; returns the thread id.
create or replace function public.get_or_create_dm_thread(p_other uuid, p_teacher uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_other = auth.uid() then raise exception 'cannot_dm_self'; end if;
  if not exists (select 1 from public.memberships m
                 where m.profile_id = auth.uid() and m.teacher_id = p_teacher and m.status = 'active')
     or not exists (select 1 from public.memberships m
                    where m.profile_id = p_other and m.teacher_id = p_teacher and m.status = 'active')
  then
    raise exception 'not_comembers';
  end if;

  if auth.uid() < p_other then v_a := auth.uid(); v_b := p_other;
  else v_a := p_other; v_b := auth.uid(); end if;

  insert into public.dm_threads (teacher_id, user_a, user_b)
  values (p_teacher, v_a, v_b)
  on conflict (teacher_id, user_a, user_b)
    do update set teacher_id = excluded.teacher_id
  returning id into v_id;

  return v_id;
end;
$$;

-- Send a message in a thread the caller participates in; bumps last_message_at.
create or replace function public.send_dm(p_thread uuid, p_body text)
returns public.dm_messages language plpgsql security definer set search_path to 'public'
as $$
declare
  v_msg public.dm_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.dm_threads t
                 where t.id = p_thread and auth.uid() in (t.user_a, t.user_b)) then
    raise exception 'not_participant';
  end if;
  if char_length(coalesce(trim(p_body), '')) = 0 then raise exception 'empty_body'; end if;

  insert into public.dm_messages (thread_id, sender_id, body)
  values (p_thread, auth.uid(), trim(p_body))
  returning * into v_msg;

  update public.dm_threads set last_message_at = now() where id = p_thread;
  return v_msg;
end;
$$;

-- Mark a thread read up to now for the calling participant.
create or replace function public.mark_dm_read(p_thread uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.dm_threads set user_a_last_read_at = now()
    where id = p_thread and user_a = auth.uid();
  update public.dm_threads set user_b_last_read_at = now()
    where id = p_thread and user_b = auth.uid();
end;
$$;

-- Total unread messages for the caller within one teacher (drives the nav badge).
create or replace function public.dm_unread_count(p_teacher uuid)
returns integer language sql stable security definer set search_path to 'public'
as $$
  select count(*)::int
  from public.dm_messages msg
  join public.dm_threads t on t.id = msg.thread_id
  where t.teacher_id = p_teacher
    and auth.uid() in (t.user_a, t.user_b)
    and msg.sender_id <> auth.uid()
    and msg.created_at > coalesce(
      case when t.user_a = auth.uid() then t.user_a_last_read_at else t.user_b_last_read_at end,
      '-infinity'::timestamptz);
$$;

grant select on public.dm_threads  to authenticated, service_role;
grant select on public.dm_messages to authenticated, service_role;
revoke all on public.dm_threads  from anon;
revoke all on public.dm_messages from anon;
grant execute on function public.get_or_create_dm_thread(uuid, uuid) to authenticated;
grant execute on function public.send_dm(uuid, text)                 to authenticated;
grant execute on function public.mark_dm_read(uuid)                  to authenticated;
grant execute on function public.dm_unread_count(uuid)               to authenticated;
