-- Post & Comment Likes
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Adds ❤️ likes to posts and comments in the Community feature.
--
-- user_id references public.profiles(id) (NOT auth.users) to match the existing
-- posts.author_id / comments.author_id convention; profiles.id == auth.uid(), so
-- the RLS check auth.uid() = user_id still holds and the likers query can embed
-- user:profiles(*) directly.

-- ---------------------------------------------------------------------------
-- post_likes
--   Composite PK (post_id, user_id) => a user can like a post at most once.
-- ---------------------------------------------------------------------------

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_post_id_idx on public.post_likes(post_id);
create index if not exists post_likes_user_id_idx on public.post_likes(user_id);

-- ---------------------------------------------------------------------------
-- comment_likes
--   Composite PK (comment_id, user_id) => a user can like a comment at most once.
-- ---------------------------------------------------------------------------

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes(comment_id);
create index if not exists comment_likes_user_id_idx on public.comment_likes(user_id);

-- ---------------------------------------------------------------------------
-- post_likes RLS
--   SELECT: any authenticated user (so counts / likers are visible to all)
--   INSERT / DELETE: own rows only (auth.uid() = user_id)
-- ---------------------------------------------------------------------------

alter table public.post_likes enable row level security;

drop policy if exists "post_likes_select" on public.post_likes;
create policy "post_likes_select"
  on public.post_likes
  for select
  to authenticated
  using (true);

drop policy if exists "post_likes_insert_own" on public.post_likes;
create policy "post_likes_insert_own"
  on public.post_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "post_likes_delete_own" on public.post_likes;
create policy "post_likes_delete_own"
  on public.post_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- comment_likes RLS (mirrors post_likes)
-- ---------------------------------------------------------------------------

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select" on public.comment_likes;
create policy "comment_likes_select"
  on public.comment_likes
  for select
  to authenticated
  using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
  on public.comment_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
  on public.comment_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);
