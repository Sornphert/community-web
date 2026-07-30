-- =====================================================================
-- 0045_dm_message_reactions.sql   (MULTI-TENANT)
-- Emoji reactions on direct messages. One row per (message, user, emoji). Reads/writes
-- are gated by participation in the message's thread; writes are own-only. Added to the
-- realtime publication so the other participant sees reactions live.
--
-- (0045 was previously drafted for user_blocks, which was dropped before shipping; the
-- number was never released, so it is reused here.)
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.dm_message_reactions (
    message_id uuid not null,
    user_id    uuid not null,
    emoji      text not null,
    created_at timestamptz default now(),
    constraint dm_message_reactions_pkey primary key (message_id, user_id, emoji),
    constraint dm_message_reactions_emoji_check check (char_length(emoji) between 1 and 16),
    constraint dm_message_reactions_msg_fkey  foreign key (message_id) references public.dm_messages(id) on delete cascade,
    constraint dm_message_reactions_user_fkey foreign key (user_id)    references public.profiles(id)    on delete cascade
);
create index if not exists dm_message_reactions_msg_idx on public.dm_message_reactions (message_id);

alter table public.dm_message_reactions enable row level security;

-- Participation in the message's thread is the gate (both read and write).
drop policy if exists dm_message_reactions_select on public.dm_message_reactions;
create policy dm_message_reactions_select on public.dm_message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.dm_messages m
      join public.dm_threads t on t.id = m.thread_id
      where m.id = dm_message_reactions.message_id
        and auth.uid() in (t.user_a, t.user_b)
    )
  );

drop policy if exists dm_message_reactions_insert_own on public.dm_message_reactions;
create policy dm_message_reactions_insert_own on public.dm_message_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.dm_messages m
      join public.dm_threads t on t.id = m.thread_id
      where m.id = dm_message_reactions.message_id
        and auth.uid() in (t.user_a, t.user_b)
    )
  );

drop policy if exists dm_message_reactions_delete_own on public.dm_message_reactions;
create policy dm_message_reactions_delete_own on public.dm_message_reactions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.dm_message_reactions to authenticated, service_role;
revoke all on public.dm_message_reactions from anon;

-- Realtime so the open thread reflects the other person's reactions live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'dm_message_reactions'
  ) then
    alter publication supabase_realtime add table public.dm_message_reactions;
  end if;
end $$;
