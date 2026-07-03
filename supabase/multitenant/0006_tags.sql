-- =============================================================================
-- 0006_tags.sql — per-teacher classroom TIER TAGS that gate Topics (v1)
-- =============================================================================
-- Additive, MT-only. Standalone, hand-run in the Supabase SQL editor on
-- community-mt-dev (no CLI migration tooling). Safe to re-run: every object is
-- guarded (create table if not exists / pg_constraint existence check for each
-- constraint / create index if not exists / create or replace fn / drop policy
-- if exists).
--
--   • tags — a teacher's tier labels (name + optional color). teacher_id →
--     teachers(id) ON DELETE CASCADE. Unique (teacher_id, name). Carries the
--     unique (id, teacher_id) that the composite same-teacher FKs below target.
--   • topic_tags — join: a topic REQUIRES a tag. Composite same-teacher FKs to
--     topics(id, teacher_id) and tags(id, teacher_id). A topic with NO topic_tags
--     rows is UNGATED (open to all members) — see can_access_topic.
--   • member_tags — join: a member HOLDS a tag. Keyed (profile_id, tag_id) with a
--     denormalized teacher_id and TWO composite same-teacher FKs:
--       (profile_id, teacher_id) → memberships(profile_id, teacher_id)
--       (tag_id,     teacher_id) → tags(id, teacher_id)
--     ISOLATION GUARANTEE (structural, all roles incl. service_role — NOT an RLS
--     WITH CHECK, which service_role bypasses): a teacher-A tag can only be
--     assigned to a member of teacher A. Both FKs pin the single teacher_id
--     column, so the membership's teacher and the tag's teacher MUST match or the
--     write is a FK violation. Cascades: revoking a membership row keeps it (status
--     flip) so tags persist harmlessly (has_membership's status='active' denies the
--     read anyway); DELETING a membership cascades its member_tags away.
--
--   • ENFORCEMENT — the tag gate lands on content_items READ only. content_items_select
--     gains `and can_access_topic(topic_id)`. has_membership and is_locked handling stay
--     BYTE-IDENTICAL (is_locked was never in RLS — it is a route/UI lifecycle guard, and
--     is deliberately not moved here). topics_select is UNCHANGED, so a non-qualifying
--     member still SEES a gated topic row (rendered locked, advertises the upsell) but is
--     denied its content_items at the API.
--   • can_access_topic(p_topic_id) — SECURITY DEFINER, locked search_path, NULL-safe;
--     mirrors has_membership/is_teacher_admin. Returns true when the topic has NO required
--     tags OR the caller holds >=1 of them. The NOT EXISTS branch makes "ungated = OPEN"
--     structurally impossible to get wrong.
--   • RLS — member-read (has_membership; member_tags: own rows or admin), admin-write
--     (is_teacher_admin). The gate does NOT depend on these SELECT policies
--     (can_access_topic is SECURITY DEFINER) — they exist only to power UI lock labels.
--   • grants — full CRUD to authenticated (RLS is the gate, like every content table);
--     NO anon grants (classroom is member-only); execute on can_access_topic to
--     authenticated; service_role full.
-- =============================================================================


-- =============================================================================
-- A — tables (carry teacher_id; composite same-teacher FKs; unique (id, teacher_id)
--     targets so child composite FKs resolve)
-- =============================================================================
create table if not exists public.tags (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    name        text not null,
    color       text,
    created_at  timestamptz default now(),
    constraint tags_pkey primary key (id),
    constraint tags_id_teacher_key unique (id, teacher_id),
    constraint tags_teacher_name_key unique (teacher_id, name)
);

create table if not exists public.topic_tags (
    topic_id    uuid not null,
    tag_id      uuid not null,
    teacher_id  uuid not null,
    created_at  timestamptz default now(),
    constraint topic_tags_pkey primary key (topic_id, tag_id)
);

create table if not exists public.member_tags (
    profile_id  uuid not null,
    tag_id      uuid not null,
    teacher_id  uuid not null,
    created_at  timestamptz default now(),
    constraint member_tags_pkey primary key (profile_id, tag_id)
);

do $$
begin
  -- tags → teachers
  if not exists (select 1 from pg_constraint where conname = 'tags_teacher_id_fkey') then
    alter table public.tags
      add constraint tags_teacher_id_fkey
      foreign key (teacher_id) references public.teachers(id) on delete cascade;
  end if;

  -- topic_tags: composite same-teacher FKs
  if not exists (select 1 from pg_constraint where conname = 'topic_tags_topic_same_teacher_fkey') then
    alter table public.topic_tags
      add constraint topic_tags_topic_same_teacher_fkey
      foreign key (topic_id, teacher_id) references public.topics (id, teacher_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'topic_tags_tag_same_teacher_fkey') then
    alter table public.topic_tags
      add constraint topic_tags_tag_same_teacher_fkey
      foreign key (tag_id, teacher_id) references public.tags (id, teacher_id) on delete cascade;
  end if;

  -- member_tags: composite same-teacher FKs (the structural isolation guarantee)
  if not exists (select 1 from pg_constraint where conname = 'member_tags_membership_fkey') then
    alter table public.member_tags
      add constraint member_tags_membership_fkey
      foreign key (profile_id, teacher_id) references public.memberships (profile_id, teacher_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_tags_tag_same_teacher_fkey') then
    alter table public.member_tags
      add constraint member_tags_tag_same_teacher_fkey
      foreign key (tag_id, teacher_id) references public.tags (id, teacher_id) on delete cascade;
  end if;
end $$;

create index if not exists tags_teacher_id_idx      on public.tags (teacher_id);
create index if not exists topic_tags_topic_id_idx  on public.topic_tags (topic_id);
create index if not exists topic_tags_tag_id_idx    on public.topic_tags (tag_id);
create index if not exists member_tags_profile_idx  on public.member_tags (profile_id);
create index if not exists member_tags_tag_id_idx   on public.member_tags (tag_id);

alter table public.tags        enable row level security;
alter table public.topic_tags  enable row level security;
alter table public.member_tags enable row level security;


-- =============================================================================
-- B — can_access_topic helper (SECURITY DEFINER; NULL→OPEN via NOT EXISTS)
-- =============================================================================
-- Mirrors has_membership / is_teacher_admin (stable, security definer, locked
-- search_path). Powers BOTH the content_items RLS gate and the presentation
-- fetcher, so the UI lock state cannot drift from the wall.
create or replace function public.can_access_topic(p_topic_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select
    -- UNGATED = OPEN: a topic with no topic_tags rows (or a null id) matches nothing
    -- → not exists → true. The "no tags accidentally locks everything" failure mode
    -- is structurally impossible.
    not exists (select 1 from public.topic_tags tt where tt.topic_id = p_topic_id)
    -- OR the caller holds >= 1 of the topic's required tags (ANY-match). Teacher scope
    -- is automatic: a member's tags only reference tags of teachers they belong to.
    or exists (
      select 1
      from public.topic_tags tt
      join public.member_tags mt
        on mt.tag_id = tt.tag_id
       and mt.profile_id = auth.uid()
      where tt.topic_id = p_topic_id
    );
$$;


-- =============================================================================
-- C — RLS: member-read, admin-write (is_teacher_admin)
-- =============================================================================
-- tags: any member of the teacher can read the label set (for "requires X"); admin writes.
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags for select to authenticated using (has_membership(teacher_id));
drop policy if exists tags_insert_admin on public.tags;
create policy tags_insert_admin on public.tags for insert to authenticated with check (is_teacher_admin(teacher_id));
drop policy if exists tags_update_admin on public.tags;
create policy tags_update_admin on public.tags for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
drop policy if exists tags_delete_admin on public.tags;
create policy tags_delete_admin on public.tags for delete to authenticated using (is_teacher_admin(teacher_id));

-- topic_tags: members see a topic's requirements; admin writes (insert/delete — no update).
drop policy if exists topic_tags_select on public.topic_tags;
create policy topic_tags_select on public.topic_tags for select to authenticated using (has_membership(teacher_id));
drop policy if exists topic_tags_insert_admin on public.topic_tags;
create policy topic_tags_insert_admin on public.topic_tags for insert to authenticated with check (is_teacher_admin(teacher_id));
drop policy if exists topic_tags_delete_admin on public.topic_tags;
create policy topic_tags_delete_admin on public.topic_tags for delete to authenticated using (is_teacher_admin(teacher_id));

-- member_tags: a member sees ONLY their own tag rows; an admin sees/writes all for the teacher.
drop policy if exists member_tags_select_self_or_admin on public.member_tags;
create policy member_tags_select_self_or_admin on public.member_tags for select to authenticated
  using (profile_id = auth.uid() or is_teacher_admin(teacher_id));
drop policy if exists member_tags_insert_admin on public.member_tags;
create policy member_tags_insert_admin on public.member_tags for insert to authenticated with check (is_teacher_admin(teacher_id));
drop policy if exists member_tags_delete_admin on public.member_tags;
create policy member_tags_delete_admin on public.member_tags for delete to authenticated using (is_teacher_admin(teacher_id));


-- =============================================================================
-- D — REVISE content_items read policy: add the tag gate (THIRD ANDed condition)
-- =============================================================================
-- BEFORE:  using (has_membership(teacher_id))
-- AFTER:   using (has_membership(teacher_id) and can_access_topic(topic_id))
-- has_membership stays byte-identical; is_locked stays a route/UI guard (never in RLS,
-- unchanged). topics_select and the content_items write policies are untouched.
drop policy if exists content_items_select on public.content_items;
create policy content_items_select on public.content_items for select to authenticated
  using (has_membership(teacher_id) and can_access_topic(topic_id));


-- =============================================================================
-- E — grants: authenticated full CRUD (RLS is the gate); service_role full; NO anon.
-- =============================================================================
grant select, insert, update, delete, truncate, references, trigger on public.tags        to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.topic_tags  to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.member_tags to authenticated;

grant all on public.tags        to service_role;
grant all on public.topic_tags  to service_role;
grant all on public.member_tags to service_role;

grant execute on function public.can_access_topic(uuid) to anon, authenticated, service_role;


-- =============================================================================
-- End of 0006. Run ONCE in the SQL editor on community-mt-dev.
-- =============================================================================
