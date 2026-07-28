-- 0039_lesson_folders.sql — nested folders for lessons within a topic (MT).
--
-- Lets an admin organize a topic's lessons into folders up to 3 levels deep, e.g.
--   folder → June → June 3-7 → (lessons). Folders are topic-scoped and self-nesting
-- (parent_folder_id); a content_item's folder_id places it in a folder (null = topic
-- root). The 3-level depth cap is enforced in the app (createLessonFolder).
--
-- Deleting a folder cascades its sub-folders; its lessons fall back to the topic root
-- (folder_id → null) rather than being deleted. Idempotent: safe to re-run.

create table if not exists public.lesson_folders (
    id               uuid primary key default gen_random_uuid(),
    teacher_id       uuid not null,
    topic_id         uuid not null,
    parent_folder_id uuid,
    name             text not null,
    position         integer not null default 0,
    created_at       timestamptz default now(),
    constraint lesson_folders_teacher_fkey foreign key (teacher_id) references public.teachers(id),
    constraint lesson_folders_topic_same_teacher_fkey
      foreign key (topic_id, teacher_id) references public.topics (id, teacher_id) on delete cascade,
    constraint lesson_folders_parent_fkey
      foreign key (parent_folder_id) references public.lesson_folders(id) on delete cascade
);
create index if not exists lesson_folders_topic_idx  on public.lesson_folders (topic_id);
create index if not exists lesson_folders_parent_idx on public.lesson_folders (parent_folder_id);

alter table public.content_items add column if not exists folder_id uuid;
alter table public.content_items drop constraint if exists content_items_folder_fkey;
alter table public.content_items add constraint content_items_folder_fkey
  foreign key (folder_id) references public.lesson_folders(id) on delete set null;

alter table public.lesson_folders enable row level security;

-- Members see folders of topics they can access (same gate as content_items).
drop policy if exists lesson_folders_select on public.lesson_folders;
create policy lesson_folders_select on public.lesson_folders for select to authenticated
  using (has_membership(teacher_id) and can_access_topic(topic_id));
-- Admin-only writes (mirrors topics / content_items).
drop policy if exists lesson_folders_insert_admin on public.lesson_folders;
create policy lesson_folders_insert_admin on public.lesson_folders for insert to authenticated
  with check (is_teacher_admin(teacher_id));
drop policy if exists lesson_folders_update_admin on public.lesson_folders;
create policy lesson_folders_update_admin on public.lesson_folders for update to authenticated
  using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
drop policy if exists lesson_folders_delete_admin on public.lesson_folders;
create policy lesson_folders_delete_admin on public.lesson_folders for delete to authenticated
  using (is_teacher_admin(teacher_id));

grant select, insert, update, delete on public.lesson_folders to authenticated, service_role;
revoke all on public.lesson_folders from anon;
