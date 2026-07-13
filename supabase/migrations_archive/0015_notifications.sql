-- =====================================================================
-- 0015_notifications.sql   (single-tenant / production `eesyjkmmyiisuaghhota`)
-- In-app notifications: @mentions, @all (admin-only), comment-on-your-post,
-- like-on-your-post, like-on-your-comment.
--
-- MODEL: one notifications row per (recipient, event). Rows are created ONLY by
-- the SECURITY DEFINER triggers below — there is NO authenticated INSERT policy,
-- so a client can't forge a notification for anyone. A recipient can only
-- SELECT / UPDATE (mark read) / DELETE their OWN rows.
--
-- MENTIONS: the composer stores mentions inline in the post/comment body as
-- tokens `@[Display Name](<uuid>)`, and @all as `@[everyone](all)`. The triggers
-- parse the uuids out of the body — plain typed "@name" text is NOT parsed.
--
-- @all is ADMIN-ONLY: enforced in-trigger via profiles.is_admin. A non-admin
-- whose body contains `](all)` generates no @all notifications.
--
-- Recipients are always resolved through live (non-tombstoned) profiles, so a
-- deleted user never receives one.
--
-- Hand-run in the Supabase SQL editor (this repo has no CLI migration tooling).
-- Idempotent: re-run the whole script on any error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Table
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
    id           uuid not null default gen_random_uuid(),
    recipient_id uuid not null,
    actor_id     uuid,
    type         text not null,
    post_id      uuid,
    comment_id   uuid,
    read_at      timestamptz,
    created_at   timestamptz not null default now(),
    constraint notifications_pkey primary key (id),
    constraint notifications_type_check check (
      type = any (array['mention','mention_all','post_comment','post_like','comment_like'])
    ),
    constraint notifications_recipient_fkey
      foreign key (recipient_id) references public.profiles(id) on delete cascade,
    constraint notifications_actor_fkey
      foreign key (actor_id)     references public.profiles(id) on delete set null,
    constraint notifications_post_fkey
      foreign key (post_id)      references public.posts(id)    on delete cascade,
    constraint notifications_comment_fkey
      foreign key (comment_id)   references public.comments(id) on delete cascade
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id) where read_at is null;

-- ---------------------------------------------------------------------
-- (2) RLS — own rows only; NO insert policy (triggers own writes)
-- ---------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- (3) Helper — extract picker-token uuids from a body string
-- ---------------------------------------------------------------------
create or replace function public._extract_mention_ids(p_body text)
returns uuid[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct (m[1])::uuid), '{}'::uuid[])
  from regexp_matches(
    coalesce(p_body, ''),
    '\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)',
    'g'
  ) as m;
$$;

-- ---------------------------------------------------------------------
-- (4) Helper — create mention + @all notifications for a body
-- ---------------------------------------------------------------------
create or replace function public._notify_mentions(
  p_actor   uuid,
  p_post    uuid,
  p_comment uuid,
  p_body    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids      uuid[] := public._extract_mention_ids(p_body);
  v_is_admin boolean;
begin
  -- Individual @mentions — one row per mentioned, live member (never the actor).
  if array_length(v_ids, 1) is not null then
    insert into public.notifications
      (recipient_id, actor_id, type, post_id, comment_id)
    select pr.id, p_actor, 'mention', p_post, p_comment
    from public.profiles pr
    where pr.id = any(v_ids)
      and pr.deleted_at is null
      and pr.id <> p_actor;
  end if;

  -- @all — ADMIN-ONLY. Skip anyone already covered by an individual mention.
  if p_body like '%](all)%' then
    select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = p_actor;

    if v_is_admin then
      insert into public.notifications
        (recipient_id, actor_id, type, post_id, comment_id)
      select pr.id, p_actor, 'mention_all', p_post, p_comment
      from public.profiles pr
      where pr.deleted_at is null
        and pr.id <> p_actor
        and pr.id <> all(v_ids);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- (5) Trigger — new post: parse mentions / @all in the body
-- ---------------------------------------------------------------------
create or replace function public.notify_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notify_mentions(new.author_id, new.id, null, new.body);
  return new;
end;
$$;

drop trigger if exists notify_on_post_insert on public.posts;
create trigger notify_on_post_insert
  after insert on public.posts
  for each row execute function public.notify_on_post();

-- ---------------------------------------------------------------------
-- (6) Trigger — new comment: mentions/@all + notify the POST author
-- ---------------------------------------------------------------------
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
begin
  select p.author_id into v_post_author
  from public.posts p where p.id = new.post_id;

  -- Mentions / @all inside the comment body.
  perform public._notify_mentions(new.author_id, new.post_id, new.id, new.body);

  -- Notify the post author of the new comment — unless they wrote it, are
  -- tombstoned, or a mention/@all for this same comment already covered them.
  if v_post_author is not null
     and v_post_author <> new.author_id
     and exists (
       select 1 from public.profiles
       where id = v_post_author and deleted_at is null
     )
     and not exists (
       select 1 from public.notifications
       where comment_id = new.id and recipient_id = v_post_author
     )
  then
    insert into public.notifications
      (recipient_id, actor_id, type, post_id, comment_id)
    values (v_post_author, new.author_id, 'post_comment', new.post_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_comment_insert on public.comments;
create trigger notify_on_comment_insert
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---------------------------------------------------------------------
-- (7) Trigger — like on a post: notify the post author (deduped)
-- ---------------------------------------------------------------------
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  select p.author_id into v_author
  from public.posts p where p.id = new.post_id;

  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  if exists (
       select 1 from public.profiles
       where id = v_author and deleted_at is null
     )
     and not exists (
       select 1 from public.notifications
       where recipient_id = v_author
         and actor_id = new.user_id
         and post_id = new.post_id
         and type = 'post_like'
     )
  then
    insert into public.notifications
      (recipient_id, actor_id, type, post_id)
    values (v_author, new.user_id, 'post_like', new.post_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_post_like_insert on public.post_likes;
create trigger notify_on_post_like_insert
  after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

-- ---------------------------------------------------------------------
-- (8) Trigger — like on a comment: notify the comment author (deduped)
-- ---------------------------------------------------------------------
create or replace function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_post   uuid;
begin
  select c.author_id, c.post_id into v_author, v_post
  from public.comments c where c.id = new.comment_id;

  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  if exists (
       select 1 from public.profiles
       where id = v_author and deleted_at is null
     )
     and not exists (
       select 1 from public.notifications
       where recipient_id = v_author
         and actor_id = new.user_id
         and comment_id = new.comment_id
         and type = 'comment_like'
     )
  then
    insert into public.notifications
      (recipient_id, actor_id, type, post_id, comment_id)
    values (v_author, new.user_id, 'comment_like', v_post, new.comment_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_comment_like_insert on public.comment_likes;
create trigger notify_on_comment_like_insert
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();

-- ---------------------------------------------------------------------
-- (9) Realtime — live pushes of a user's own rows to the bell.
--     Safe to run repeatedly.
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
