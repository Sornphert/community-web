-- Post PDF Attachments
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Adds one-or-more PDF file attachments to community posts (WEB only). Mirrors
-- the existing post_images pattern: a child table with FK to posts(id) on delete
-- cascade, a PUBLIC storage bucket, and RLS gated by ownership of the parent post.
--
-- post_attachments references ONLY public.posts(id) (no profiles FK), so it does
-- NOT introduce PostgREST relationship ambiguity for the existing
-- author:profiles!author_id / user:profiles!user_id embeds. The new
-- attachments:post_attachments(*) embed is a plain to-many, like images:post_images(*).

-- ---------------------------------------------------------------------------
-- post_attachments
--   Mirrors post_images, plus file_name / file_size for rendering the card.
-- ---------------------------------------------------------------------------

create table if not exists public.post_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  url text not null,                 -- public URL from getPublicUrl()
  storage_path text not null,        -- {user_id}/{post_id}/{position}.pdf
  file_name text not null,           -- original filename, for display
  file_size bigint not null,         -- bytes, for human-readable size
  position integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists post_attachments_post_id_idx
  on public.post_attachments(post_id);

-- ---------------------------------------------------------------------------
-- post_attachments RLS
--   SELECT: any authenticated user (attachments visible to all members).
--   INSERT / DELETE: only the author of the parent post (mirrors post_images).
--   No UPDATE policy (attachments are immutable once posted).
-- ---------------------------------------------------------------------------

alter table public.post_attachments enable row level security;

drop policy if exists "post_attachments_select" on public.post_attachments;
create policy "post_attachments_select"
  on public.post_attachments
  for select
  to authenticated
  using (true);

drop policy if exists "post_attachments_insert_own" on public.post_attachments;
create policy "post_attachments_insert_own"
  on public.post_attachments
  for insert
  to authenticated
  with check (
    auth.uid() = (select author_id from public.posts where id = post_id)
  );

drop policy if exists "post_attachments_delete_own" on public.post_attachments;
create policy "post_attachments_delete_own"
  on public.post_attachments
  for delete
  to authenticated
  using (
    auth.uid() = (select author_id from public.posts where id = post_id)
  );

-- ---------------------------------------------------------------------------
-- Storage bucket: post-attachments
--   Create in the Supabase Dashboard (Storage > New bucket), or via the SQL
--   below. Settings (recorded decisions):
--     * PUBLIC  -- matches post-images; PDFs are URL-accessible without an auth
--                  check (we use getPublicUrl). Accepted, not a silent default.
--     * file_size_limit = 26214400 (25 MB) -- TRUE server-side size gate. MUST
--                  equal MAX_ATTACHMENT_SIZE_BYTES in lib/attachments.ts.
--     * allowed_mime_types = {application/pdf} -- validates only the DECLARED
--                  content-type the client sends. Supabase does NOT byte-sniff,
--                  and the client sets contentType itself, so MIME is spoofable
--                  by a crafted client. Best-effort / honest-client guard only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-attachments',
  'post-attachments',
  true,
  26214400,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage RLS on storage.objects for the post-attachments bucket
--   Mirrors post-images: INSERT/DELETE require the first path segment to equal
--   the caller's uid ({user_id}/{post_id}/{position}.pdf); SELECT for members.
--
--   PRE-FLIGHT (do this BEFORE running this block): Postgres ORs permissive
--   policies, so a single broad/all-buckets policy would bypass the per-user
--   folder restriction below. List existing policies and confirm none lacks a
--   bucket_id restriction:
--
--     select policyname, cmd, roles, qual, with_check
--     from pg_policies
--     where schemaname = 'storage' and tablename = 'objects';
--
--   If a broad all-buckets INSERT/DELETE policy exists, STOP and fix that first.
--
--   Every policy below is scoped with bucket_id = 'post-attachments' so it can
--   never loosen other buckets.
-- ---------------------------------------------------------------------------

drop policy if exists "post_attachments_objects_select" on storage.objects;
create policy "post_attachments_objects_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'post-attachments');

drop policy if exists "post_attachments_objects_insert_own" on storage.objects;
create policy "post_attachments_objects_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-attachments'
    and storage.foldername(name)[1] = auth.uid()::text
  );

drop policy if exists "post_attachments_objects_delete_own" on storage.objects;
create policy "post_attachments_objects_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-attachments'
    and storage.foldername(name)[1] = auth.uid()::text
  );
