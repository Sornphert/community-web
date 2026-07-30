-- =====================================================================
-- 0044_follow_and_reply_notifications.sql   (MULTI-TENANT)
-- Two new notification kinds:
--   * 'follow'        — someone followed you. Follows are GLOBAL but notifications are
--                       teacher-scoped, so a SECURITY DEFINER trigger stamps ONE teacher
--                       both users actively share (the row then surfaces in that teacher's
--                       bell). No shared teacher → no notification.
--   * 'comment_reply' — someone replied to your comment (0043 threading). Fired from the
--                       existing notify_on_comment trigger when NEW.parent_id is set.
--
-- Client inserts into notifications are revoked (0013/0016) — both paths are trigger-only.
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

-- (1) Widen the type CHECK.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'mention','mention_all','post_comment','post_like','comment_like',
    'event_reminder','direct_message','follow','comment_reply'
  ])
);

-- (2) notify_on_comment — unchanged behaviour PLUS a reply notification to the parent
--     comment's author. Full create-or-replace (mirrors schema.sql).
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher       uuid;
  v_post_author   uuid;
  v_parent_author uuid;
begin
  select p.teacher_id, p.author_id
    into v_teacher, v_post_author
  from public.posts p
  where p.id = new.post_id;

  if v_teacher is null then
    return new;
  end if;

  -- Mentions / @all inside the comment body.
  perform public._notify_mentions(v_teacher, new.author_id, new.post_id, new.id, new.body);

  -- Notify the post author of the new comment — unless they wrote it, or a
  -- mention/@all for this same comment already covered them (mention wins).
  if v_post_author is not null
     and v_post_author <> new.author_id
     and exists (
       select 1 from public.memberships mem
       join public.profiles pr on pr.id = mem.profile_id
       where mem.teacher_id = v_teacher
         and mem.profile_id = v_post_author
         and mem.status = 'active'
         and pr.deleted_at is null
     )
     and not exists (
       select 1 from public.notifications
       where comment_id = new.id and recipient_id = v_post_author
     )
  then
    insert into public.notifications
      (teacher_id, recipient_id, actor_id, type, post_id, comment_id)
    values (v_teacher, v_post_author, new.author_id, 'post_comment', new.post_id, new.id);
  end if;

  -- Reply (0043/0044): notify the PARENT comment's author — unless they wrote the reply,
  -- they're the post author (already pinged above), they're not an active member, or a
  -- mention for this same comment already covered them.
  if new.parent_id is not null then
    select author_id into v_parent_author from public.comments where id = new.parent_id;
    if v_parent_author is not null
       and v_parent_author <> new.author_id
       and (v_post_author is null or v_parent_author <> v_post_author)
       and exists (
         select 1 from public.memberships mem
         join public.profiles pr on pr.id = mem.profile_id
         where mem.teacher_id = v_teacher
           and mem.profile_id = v_parent_author
           and mem.status = 'active'
           and pr.deleted_at is null
       )
       and not exists (
         select 1 from public.notifications
         where comment_id = new.id and recipient_id = v_parent_author
       )
    then
      insert into public.notifications
        (teacher_id, recipient_id, actor_id, type, post_id, comment_id)
      values (v_teacher, v_parent_author, new.author_id, 'comment_reply', new.post_id, new.id);
    end if;
  end if;

  return new;
end;
$$;

-- (3) notify_on_follow — new. Resolves a shared active teacher and notifies the followee.
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
begin
  -- One teacher both users actively belong to. follows are global; the notification is
  -- teacher-scoped, so it surfaces in a shared community's bell. No overlap → skip.
  select m1.teacher_id into v_teacher
  from public.memberships m1
  join public.memberships m2 on m2.teacher_id = m1.teacher_id
  where m1.profile_id = new.following_id and m1.status = 'active'
    and m2.profile_id = new.follower_id  and m2.status = 'active'
  limit 1;

  if v_teacher is null then
    return new;
  end if;

  insert into public.notifications (teacher_id, recipient_id, actor_id, type)
  values (v_teacher, new.following_id, new.follower_id, 'follow');

  return new;
end;
$$;

drop trigger if exists notify_on_follow_insert on public.follows;
create trigger notify_on_follow_insert
  after insert on public.follows
  for each row execute function public.notify_on_follow();
