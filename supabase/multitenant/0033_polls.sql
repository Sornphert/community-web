-- 0033_polls.sql — polls attached to a post (MT).
--
-- A poll belongs to exactly one post (polls.post_id UNIQUE). Options are ordered
-- rows; a vote is one (option_id, user_id) row — presence means "voted for it".
-- Single- vs multi-choice is a flag on the poll; single-choice is enforced in the
-- app (delete prior votes for the poll, then insert). All three tables are
-- membership-gated for SELECT via the owning post's teacher; writes are own-only.
--
-- Idempotent: safe to re-run.

create table if not exists public.polls (
    id             uuid primary key default gen_random_uuid(),
    post_id        uuid not null unique,
    allow_multiple boolean not null default false,
    closes_at      timestamptz,
    created_at     timestamptz default now(),
    constraint polls_post_fkey foreign key (post_id) references public.posts(id) on delete cascade
);

create table if not exists public.poll_options (
    id         uuid primary key default gen_random_uuid(),
    poll_id    uuid not null,
    text       text not null,
    position   integer not null,
    created_at timestamptz default now(),
    constraint poll_options_text_check check (char_length(text) between 1 and 200),
    constraint poll_options_poll_fkey foreign key (poll_id) references public.polls(id) on delete cascade
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id, position);

create table if not exists public.poll_votes (
    poll_id    uuid not null,
    option_id  uuid not null,
    user_id    uuid not null,
    created_at timestamptz default now(),
    constraint poll_votes_pkey primary key (option_id, user_id),
    constraint poll_votes_poll_fkey   foreign key (poll_id)   references public.polls(id)        on delete cascade,
    constraint poll_votes_option_fkey foreign key (option_id) references public.poll_options(id) on delete cascade,
    constraint poll_votes_user_fkey   foreign key (user_id)   references public.profiles(id)     on delete cascade
);
create index if not exists poll_votes_poll_idx on public.poll_votes (poll_id);

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

-- polls — read for members of the post's teacher; only the post's author may
-- create the poll. No UPDATE/DELETE (immutable; cascades with the post).
drop policy if exists polls_select on public.polls;
create policy polls_select on public.polls for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = polls.post_id)));
drop policy if exists polls_insert_own on public.polls;
create policy polls_insert_own on public.polls for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = polls.post_id and p.author_id = auth.uid()));

-- poll_options — read membership-gated via poll→post; insert only by the post author.
drop policy if exists poll_options_select on public.poll_options;
create policy poll_options_select on public.poll_options for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p
                         join public.polls pl on pl.post_id = p.id
                         where pl.id = poll_options.poll_id)));
drop policy if exists poll_options_insert_own on public.poll_options;
create policy poll_options_insert_own on public.poll_options for insert to authenticated
  with check (exists (select 1 from public.polls pl
                      join public.posts p on p.id = pl.post_id
                      where pl.id = poll_options.poll_id and p.author_id = auth.uid()));

-- poll_votes — read membership-gated; write own only, and only while the poll is open.
drop policy if exists poll_votes_select on public.poll_votes;
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p
                         join public.polls pl on pl.post_id = p.id
                         where pl.id = poll_votes.poll_id)));
drop policy if exists poll_votes_insert_own on public.poll_votes;
create policy poll_votes_insert_own on public.poll_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_membership((select p.teacher_id from public.posts p
                        join public.polls pl on pl.post_id = p.id
                        where pl.id = poll_votes.poll_id))
    and exists (select 1 from public.polls pl
                where pl.id = poll_votes.poll_id
                and (pl.closes_at is null or pl.closes_at > now()))
  );
drop policy if exists poll_votes_delete_own on public.poll_votes;
create policy poll_votes_delete_own on public.poll_votes for delete to authenticated
  using (user_id = auth.uid());

grant select, insert on public.polls        to authenticated, service_role;
grant select, insert on public.poll_options to authenticated, service_role;
grant select, insert, delete on public.poll_votes to authenticated, service_role;
revoke all on public.polls        from anon;
revoke all on public.poll_options from anon;
revoke all on public.poll_votes   from anon;
