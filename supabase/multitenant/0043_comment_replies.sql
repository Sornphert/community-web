-- =====================================================================
-- 0043_comment_replies.sql   (MULTI-TENANT)
-- One level of threaded replies on comments. parent_id points at the TOP-LEVEL comment
-- a reply belongs to (the UI always attaches a reply to the thread's root, so the tree
-- never goes deeper than two levels — the common Instagram-style model). Null parent_id
-- = a top-level comment.
--
-- No new RLS needed: comments' existing own-only insert / author-or-admin delete policies
-- already govern replies (a reply IS a comment). ON DELETE CASCADE means deleting a
-- top-level comment removes its replies too.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

alter table public.comments
  add column if not exists parent_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comments_parent_fkey'
  ) then
    alter table public.comments
      add constraint comments_parent_fkey
      foreign key (parent_id) references public.comments(id) on delete cascade;
  end if;
end $$;

create index if not exists comments_parent_idx on public.comments (parent_id);
