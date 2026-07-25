-- =====================================================================
-- 0026_comments_edit_delete_images.sql   (MULTI-TENANT)
-- Ports two single-tenant features to MT:
--   A. Comment EDIT (author) + DELETE (author OR admin of the comment's teacher)
--   B. Comment IMAGE attachments (comment_images + a public comment-images bucket)
--
-- Admin here is PER-TEACHER, resolved via is_teacher_admin() of the comment's
-- post's teacher — never a global flag. The updateComment/deleteComment server
-- actions re-check this and run through the service-role client; the RLS below is
-- the second layer.
--
-- Standalone, hand-run in the Supabase SQL editor, then reconciled into
-- supabase/multitenant/schema.sql. Idempotent: re-run on any error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A1. comments.edited_at
-- ---------------------------------------------------------------------
alter table public.comments add column if not exists edited_at timestamptz;

-- A2. DELETE = author OR admin-of-this-teacher. UPDATE stays author-only
--     (comments_update_own, unchanged). is_teacher_admin is the SAME RPC the
--     posts *_admin policies use; the teacher is resolved from the comment's post.
drop policy if exists comments_delete_own on public.comments;
drop policy if exists comments_delete_owner_or_admin on public.comments;
create policy comments_delete_owner_or_admin on public.comments
  for delete to authenticated
  using (
    auth.uid() = author_id
    or public.is_teacher_admin(
      (select p.teacher_id from public.posts p where p.id = comments.post_id)
    )
  );

-- ---------------------------------------------------------------------
-- B1. comment_images table — read for all authenticated; write gated by
--     ownership of the parent comment. (No teacher_id column needed: tenancy
--     flows through the comment → post.)
-- ---------------------------------------------------------------------
create table if not exists public.comment_images (
    id           uuid default gen_random_uuid() not null,
    comment_id   uuid not null,
    url          text not null,
    storage_path text not null,
    "position"   integer default 0 not null,
    created_at   timestamptz default now(),
    constraint comment_images_pkey primary key (id),
    constraint comment_images_comment_id_fkey
      foreign key (comment_id) references public.comments(id) on delete cascade
);
create index if not exists comment_images_comment_idx
  on public.comment_images (comment_id, "position");

alter table public.comment_images enable row level security;

drop policy if exists comment_images_select on public.comment_images;
create policy comment_images_select on public.comment_images
  for select to authenticated using (true);

drop policy if exists comment_images_insert_own on public.comment_images;
create policy comment_images_insert_own on public.comment_images
  for insert to authenticated
  with check (exists (
    select 1 from public.comments c
    where c.id = comment_images.comment_id and c.author_id = auth.uid()
  ));

drop policy if exists comment_images_delete_own on public.comment_images;
create policy comment_images_delete_own on public.comment_images
  for delete to authenticated
  using (exists (
    select 1 from public.comments c
    where c.id = comment_images.comment_id and c.author_id = auth.uid()
  ));

grant select, insert, update, delete on public.comment_images
  to authenticated, service_role;
revoke all on public.comment_images from anon;

-- ---------------------------------------------------------------------
-- B2. Storage — public `comment-images` bucket; own-folder writes.
--     Path convention: {user_id}/{comment_id}/{position}.jpg  (mirrors avatars,
--     which also gates on foldername[1] = uid). Public read like post-images.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comment-images', 'comment-images', true)
on conflict (id) do nothing;

drop policy if exists comment_images_obj_select on storage.objects;
create policy comment_images_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'comment-images');

drop policy if exists comment_images_obj_insert on storage.objects;
create policy comment_images_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists comment_images_obj_delete on storage.objects;
create policy comment_images_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
