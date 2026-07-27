-- =====================================================================
-- 0029_saved_posts.sql   (MULTI-TENANT)
-- Saved posts / bookmarks: a member saves a post to their personal list.
-- One row per (user, post); strictly own-only (a save is private). Reading the
-- saved list joins posts, which stays membership-gated by the posts RLS.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.saved_posts (
    user_id    uuid not null,
    post_id    uuid not null,
    created_at timestamptz default now(),
    constraint saved_posts_pkey primary key (user_id, post_id),
    constraint saved_posts_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
    constraint saved_posts_post_fkey foreign key (post_id) references public.posts(id)    on delete cascade
);
create index if not exists saved_posts_user_idx on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

drop policy if exists saved_posts_select_own on public.saved_posts;
create policy saved_posts_select_own on public.saved_posts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists saved_posts_insert_own on public.saved_posts;
create policy saved_posts_insert_own on public.saved_posts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists saved_posts_delete_own on public.saved_posts;
create policy saved_posts_delete_own on public.saved_posts
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_posts to authenticated, service_role;
revoke all on public.saved_posts from anon;
