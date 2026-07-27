-- 0036_channel_reads.sql — per-user, per-channel "last read" marks (MT).
--
-- Drives the unread dot on channels: a channel is unread when its latest post (by
-- someone other than you) is newer than your last_read_at for that channel, or you
-- have never opened it. Own-only RLS; upserted client-side when a channel is opened.
--
-- Idempotent: safe to re-run.

create table if not exists public.channel_reads (
    user_id      uuid not null,
    channel_id   uuid not null,
    last_read_at timestamptz not null default now(),
    constraint channel_reads_pkey primary key (user_id, channel_id),
    constraint channel_reads_user_fkey    foreign key (user_id)    references public.profiles(id) on delete cascade,
    constraint channel_reads_channel_fkey foreign key (channel_id) references public.channels(id) on delete cascade
);

alter table public.channel_reads enable row level security;

drop policy if exists channel_reads_select_own on public.channel_reads;
create policy channel_reads_select_own on public.channel_reads for select to authenticated
  using (user_id = auth.uid());
drop policy if exists channel_reads_insert_own on public.channel_reads;
create policy channel_reads_insert_own on public.channel_reads for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists channel_reads_update_own on public.channel_reads;
create policy channel_reads_update_own on public.channel_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists channel_reads_delete_own on public.channel_reads;
create policy channel_reads_delete_own on public.channel_reads for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.channel_reads to authenticated, service_role;
revoke all on public.channel_reads from anon;
