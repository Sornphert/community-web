-- Comment image attachments (WEB + future mobile)
-- Run this in the Supabase SQL editor on BOTH projects (Johnson + Bootcamp)
-- BEFORE deploying the app code. Idempotent: safe to re-run. Mirrors post_images.
--
-- Lets members attach images to a comment (e.g. trading result screenshots).
-- Same shape/RLS as post_images: a public `comment-images` bucket, rows gated by
-- ownership of the parent comment, storage objects gated to the uploader's own
-- {user_id}/... folder. Client converts every upload to JPEG first (app convention).

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Table RLS — read for all authenticated; write gated by owning the comment.
-- ---------------------------------------------------------------------------
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
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Storage — public `comment-images` bucket; own-folder writes.
--    Path convention: {user_id}/{comment_id}/{position}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comment-images', 'comment-images', true)
on conflict (id) do nothing;

drop policy if exists "Comment image objects readable" on storage.objects;
create policy "Comment image objects readable" on storage.objects
  for select to authenticated
  using (bucket_id = 'comment-images');

drop policy if exists "Users can upload their own comment images" on storage.objects;
create policy "Users can upload their own comment images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own comment images" on storage.objects;
create policy "Users can delete their own comment images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comment-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
