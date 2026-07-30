-- =====================================================================
-- 0046_dm_images.sql   (MULTI-TENANT)
-- Image attachments on direct messages. A message may now carry an image (with optional
-- text). Storage mirrors the existing comment-images/avatars convention: a PUBLIC bucket
-- with uid-scoped writes and unguessable `{uid}/{uuid}.jpg` paths (getPublicUrl, no
-- signing — consistent with how the app already serves comment/post images).
--
-- send_dm gains optional image params and its signature CHANGES (uuid,text) →
-- (uuid,text,text,text); the old 2-arg overload is dropped so a 2-arg call can't bypass
-- the new logic. Client calls with named params, so absent image args use the defaults.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

-- Bucket (public read; writes gated below).
insert into storage.buckets (id, name, public)
values ('dm-images', 'dm-images', true)
on conflict (id) do nothing;

drop policy if exists dm_images_obj_insert_own on storage.objects;
create policy dm_images_obj_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'dm-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists dm_images_obj_delete_own on storage.objects;
create policy dm_images_obj_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'dm-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Message columns.
alter table public.dm_messages add column if not exists image_url  text;
alter table public.dm_messages add column if not exists image_path text;

-- Relax the body check to allow an empty body when an image is present.
alter table public.dm_messages drop constraint if exists dm_messages_body_check;
alter table public.dm_messages add constraint dm_messages_body_check
  check (char_length(body) between 0 and 4000);
alter table public.dm_messages drop constraint if exists dm_messages_content_check;
alter table public.dm_messages add constraint dm_messages_content_check
  check (body <> '' or image_url is not null);

-- send_dm v2: optional image. Drop the old signature so 2-arg calls resolve to this one.
drop function if exists public.send_dm(uuid, text);
create or replace function public.send_dm(
  p_thread uuid, p_body text, p_image_url text default null, p_image_path text default null
)
returns public.dm_messages language plpgsql security definer set search_path to 'public'
as $$
declare v_msg public.dm_messages; v_other uuid; v_body text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select case when t.user_a = auth.uid() then t.user_b else t.user_a end
    into v_other
  from public.dm_threads t
  where t.id = p_thread and auth.uid() in (t.user_a, t.user_b);
  if v_other is null then raise exception 'not_participant'; end if;
  v_body := coalesce(trim(p_body), '');
  if char_length(v_body) = 0 and p_image_url is null then raise exception 'empty_body'; end if;
  insert into public.dm_messages (thread_id, sender_id, body, image_url, image_path)
  values (p_thread, auth.uid(), v_body, p_image_url, p_image_path) returning * into v_msg;
  update public.dm_threads set last_message_at = now() where id = p_thread;
  insert into public.notifications (teacher_id, recipient_id, actor_id, type, thread_id)
  select t.teacher_id, v_other, auth.uid(), 'direct_message', t.id
  from public.dm_threads t where t.id = p_thread;
  return v_msg;
end;
$$;

grant execute on function public.send_dm(uuid, text, text, text) to authenticated;
