-- =====================================================================
-- 0042_comment_reactions.sql   (MULTI-TENANT)
-- Emoji reactions on comments. One row per (comment, user, emoji) — a member can add
-- several different emojis to a comment; each is a toggle. Direct mirror of
-- post_reactions (0032): reads gated by membership of the comment's post's teacher,
-- writes are own-only.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.comment_reactions (
    comment_id uuid not null,
    user_id    uuid not null,
    emoji      text not null,
    created_at timestamptz default now(),
    constraint comment_reactions_pkey primary key (comment_id, user_id, emoji),
    constraint comment_reactions_emoji_check check (char_length(emoji) between 1 and 16),
    constraint comment_reactions_comment_fkey foreign key (comment_id) references public.comments(id) on delete cascade,
    constraint comment_reactions_user_fkey    foreign key (user_id)    references public.profiles(id) on delete cascade
);
create index if not exists comment_reactions_comment_idx on public.comment_reactions (comment_id);

alter table public.comment_reactions enable row level security;

-- Membership of the comment's post's teacher is the read gate (comments → posts → teacher).
drop policy if exists comment_reactions_select on public.comment_reactions;
create policy comment_reactions_select on public.comment_reactions
  for select to authenticated
  using (has_membership((
    select p.teacher_id from public.posts p
    join public.comments c on c.post_id = p.id
    where c.id = comment_reactions.comment_id
  )));

drop policy if exists comment_reactions_insert_own on public.comment_reactions;
create policy comment_reactions_insert_own on public.comment_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_membership((
      select p.teacher_id from public.posts p
      join public.comments c on c.post_id = p.id
      where c.id = comment_reactions.comment_id
    ))
  );

drop policy if exists comment_reactions_delete_own on public.comment_reactions;
create policy comment_reactions_delete_own on public.comment_reactions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.comment_reactions to authenticated, service_role;
revoke all on public.comment_reactions from anon;
