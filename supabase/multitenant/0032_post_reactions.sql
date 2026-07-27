-- =====================================================================
-- 0032_post_reactions.sql   (MULTI-TENANT)
-- Emoji reactions on posts. One row per (post, user, emoji) — a member can add
-- several different emojis to a post; each is a toggle. Reads gated by membership
-- of the post's teacher (like comments); writes are own-only.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.post_reactions (
    post_id    uuid not null,
    user_id    uuid not null,
    emoji      text not null,
    created_at timestamptz default now(),
    constraint post_reactions_pkey primary key (post_id, user_id, emoji),
    constraint post_reactions_emoji_check check (char_length(emoji) between 1 and 16),
    constraint post_reactions_post_fkey foreign key (post_id) references public.posts(id)    on delete cascade,
    constraint post_reactions_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

alter table public.post_reactions enable row level security;

drop policy if exists post_reactions_select on public.post_reactions;
create policy post_reactions_select on public.post_reactions
  for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_reactions.post_id)));

drop policy if exists post_reactions_insert_own on public.post_reactions;
create policy post_reactions_insert_own on public.post_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_membership((select p.teacher_id from public.posts p where p.id = post_reactions.post_id))
  );

drop policy if exists post_reactions_delete_own on public.post_reactions;
create policy post_reactions_delete_own on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.post_reactions to authenticated, service_role;
revoke all on public.post_reactions from anon;
