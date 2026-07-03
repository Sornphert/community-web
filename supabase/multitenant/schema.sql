-- =============================================================================
-- supabase/multitenant/schema.sql — CANONICAL MULTI-TENANT schema
-- =============================================================================
-- Authored line-by-line from the live community-mt-dev dump (ref ylptpshxwmocsitkcufh),
-- captured 2026-06. PROPOSAL_schema.sql was the (never-run) plan and is a readability
-- cross-check ONLY — this file traces to the dump.
--
-- Run ONCE on a fresh project (SQL Editor), BEFORE multitenant/seed.sql, then
-- scripts/dev-seed-personas.ts. Do NOT run bootstrap/schema.sql (single-tenant, for main).
--
-- Captured separately from the public dump and folded in here:
--   • storage.objects RLS policies (Section 9)   • on_auth_user_created trigger (Section 5)
-- INTENTIONAL deviations from raw dump text (the ONLY expected schema-diff deltas):
--   [D4] trigger qualified to public.handle_new_user() (search-path safety on fresh project)
--   [D6] storage policies guarded by DROP POLICY IF EXISTS (re-run safety on the shared
--        storage schema, which a `drop schema public cascade` does not clear)
-- delete_my_account() was ABSENT on the live MT dump (dropped out-of-band during the MT
-- build). It is RESTORED here in Section 10 as the multi-tenant rewrite (per-teacher admin
-- rule, MT storage prefixes); see 0001_delete_my_account_mt.sql (standalone create-or-replace).
-- Migration 0002 (teacher branding cover_url/logo_url/description; teacher-covers +
-- teacher-logos buckets; avatars own-uid write realign; teacher_member_counts() RPC; anon
-- teachers directory read) was run on community-mt-dev and is FOLDED IN below; see
-- 0002_teacher_branding_and_public_directory.sql (standalone, hand-run).
-- Migration 0003 (teachers admin UPDATE policy — the missing policy that made the
-- branding UPDATE match 0 rows) was run on community-mt-dev and is FOLDED IN below;
-- see 0003_teachers_admin_update_policy.sql (standalone, hand-run).
-- Migration 0004 (categories reference table + teachers.category_id nullable FK; public
-- read policies + grants) was run on community-mt-dev and is FOLDED IN below; see
-- 0004_categories.sql (standalone, hand-run).
-- Migration 0005 (newsletter_items + RLS: public read, two-part admin write rule; grants)
-- was run on community-mt-dev and is FOLDED IN below; see 0005_newsletter.sql (standalone,
-- hand-run).
-- Migration 0006 (classroom TIER TAGS: tags/topic_tags/member_tags + can_access_topic helper;
-- content_items_select gains the tag gate; member-read/admin-write RLS; grants) is FOLDED IN
-- below; see 0006_tags.sql (standalone, hand-run).
-- =============================================================================

set check_function_bodies = false;

-- Extensions present on live (gen_random_uuid lives in pgcrypto/core).
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";


-- =============================================================================
-- SECTION 0 — base tables (no outgoing FKs)
-- =============================================================================
create table public.categories (
    id          uuid not null default gen_random_uuid(),
    slug        text not null,
    name        text not null,
    created_at  timestamptz default now(),
    constraint categories_pkey primary key (id),
    constraint categories_slug_key unique (slug)
);

create table public.teachers (
    id          uuid not null default gen_random_uuid(),
    slug        text not null,
    name        text not null,
    created_at  timestamptz default now(),
    cover_url   text,
    logo_url    text,
    description text,
    category_id uuid,
    constraint teachers_pkey primary key (id),
    constraint teachers_slug_key unique (slug),
    constraint teachers_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null
);

-- profiles.id == auth.uid() for live users, but has NO FK to auth.users (preserve the
-- 0007 decoupling so a tombstoned profile survives auth.users deletion). is_admin is
-- GONE — role lives on memberships.role.
create table public.profiles (
    id            uuid not null,
    display_name  text not null,
    bio           text,
    avatar_url    text,
    created_at    timestamptz default now(),
    deleted_at    timestamptz,
    social_links  jsonb not null default '{}'::jsonb,
    constraint profiles_pkey primary key (id)
);
create index profiles_deleted_at_idx on public.profiles (deleted_at) where (deleted_at is not null);


-- =============================================================================
-- SECTION 1 — memberships (profile↔teacher join)
-- =============================================================================
create table public.memberships (
    id          uuid not null default gen_random_uuid(),
    profile_id  uuid not null,
    teacher_id  uuid not null,
    role        text not null default 'member',
    status      text not null default 'active',
    created_at  timestamptz default now(),
    constraint memberships_pkey primary key (id),
    constraint memberships_profile_teacher_key unique (profile_id, teacher_id),
    constraint memberships_role_check   check (role   = any (array['member','admin'])),
    constraint memberships_status_check check (status = any (array['active','revoked'])),
    constraint memberships_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade,
    constraint memberships_teacher_id_fkey foreign key (teacher_id) references public.teachers(id) on delete cascade
);
create index memberships_lookup_idx  on public.memberships (profile_id, teacher_id, status);
create index memberships_teacher_idx on public.memberships (teacher_id);


-- =============================================================================
-- SECTION 2 — authz helpers (SECURITY DEFINER; NULL→false)
-- =============================================================================
create or replace function public.has_membership(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_teacher_id is null then false
    else exists (select 1 from public.memberships m
                 where m.profile_id = auth.uid() and m.teacher_id = p_teacher_id and m.status = 'active')
  end;
$$;

create or replace function public.is_teacher_admin(p_teacher_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select case
    when p_teacher_id is null then false
    else exists (select 1 from public.memberships m
                 where m.profile_id = auth.uid() and m.teacher_id = p_teacher_id
                   and m.status = 'active' and m.role = 'admin')
  end;
$$;

-- Directory aggregate (NOT an authz gate): one row per teacher with >=1 active
-- member. SECURITY DEFINER so it bypasses the memberships RLS (which hides co-member
-- rows from non-members/anon), but returns ONLY (teacher_id, count) — never any PII.
-- Powers the member-count badge on the logged-out + non-member Discover cards.
-- Teachers with zero active members are simply absent (the app treats missing as 0).
create or replace function public.teacher_member_counts()
returns table(teacher_id uuid, member_count bigint)
language sql stable security definer set search_path to 'public'
as $$
  select m.teacher_id, count(*)::bigint as member_count
  from public.memberships m
  where m.status = 'active'
  group by m.teacher_id;
$$;


-- =============================================================================
-- SECTION 3 — spine tables (carry teacher_id; composite same-teacher FKs)
-- =============================================================================
create table public.week_groups (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    name        text not null,
    "position"  integer not null default 0,
    created_at  timestamptz default now(),
    constraint week_groups_pkey primary key (id),
    constraint week_groups_id_teacher_key unique (id, teacher_id),
    constraint week_groups_teacher_id_fkey foreign key (teacher_id) references public.teachers(id)
);
create index week_groups_position_idx on public.week_groups (teacher_id, "position" desc);

create table public.channels (
    id              uuid not null default gen_random_uuid(),
    teacher_id      uuid not null,
    slug            text not null,
    name            text not null,
    description     text,
    "position"      integer not null default 0,
    post_permission text not null default 'all',
    section         text not null default 'community',
    week_number     integer,
    group_id        uuid,
    created_at      timestamptz default now(),
    constraint channels_pkey primary key (id),
    constraint channels_id_teacher_key unique (id, teacher_id),
    constraint channels_teacher_slug_key unique (teacher_id, slug),
    constraint channels_post_permission_check check (post_permission = any (array['all','admin_only'])),
    constraint channels_section_check check (section = any (array['community','weekly'])),
    constraint channels_weekly_has_group check ((section <> 'weekly') or (group_id is not null)),
    constraint channels_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint channels_group_same_teacher_fkey
      foreign key (group_id, teacher_id) references public.week_groups (id, teacher_id)
);
create index channels_position_idx on public.channels (teacher_id, "position");
create index channels_section_group_week_idx on public.channels (teacher_id, section, group_id, week_number desc);

create table public.posts (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    author_id   uuid not null,
    title       text,
    body        text not null,
    channel_id  uuid,
    edited_at   timestamptz,
    created_at  timestamptz default now(),
    constraint posts_pkey primary key (id),
    constraint posts_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint posts_author_id_fkey  foreign key (author_id)  references public.profiles(id) on delete cascade,
    constraint posts_channel_same_teacher_fkey
      foreign key (channel_id, teacher_id) references public.channels (id, teacher_id)
);
create index posts_created_at_idx on public.posts (teacher_id, created_at desc);
create index posts_channel_id_idx on public.posts (channel_id);
create index posts_author_id_idx  on public.posts (author_id);

create table public.topics (
    id                 uuid not null default gen_random_uuid(),
    teacher_id         uuid not null,
    name               text not null,
    description        text,
    cover_image_url    text,
    cover_storage_path text,
    "position"         smallint not null default 0,
    is_locked          boolean not null default false,
    is_recordings      boolean not null default false,
    created_at         timestamptz default now(),
    constraint topics_pkey primary key (id),
    constraint topics_id_teacher_key unique (id, teacher_id),
    constraint topics_teacher_id_fkey foreign key (teacher_id) references public.teachers(id)
);
create index topics_position_idx on public.topics (teacher_id, "position");
create unique index topics_one_recordings_per_teacher_idx on public.topics (teacher_id) where (is_recordings);

create table public.content_items (
    id                     uuid not null default gen_random_uuid(),
    teacher_id             uuid not null,
    topic_id               uuid not null,
    type                   text not null,
    title                  text not null,
    description            text,
    video_url              text,
    document_url           text,
    document_storage_path  text,
    thumbnail_url          text,
    thumbnail_storage_path text,
    "position"             smallint not null default 0,
    created_at             timestamptz default now(),
    constraint content_items_pkey primary key (id),
    constraint content_items_type_check check (type = any (array['video','document'])),
    constraint content_items_payload_check check (
      ((type = 'video') and (video_url is not null)) or
      ((type = 'document') and (document_url is not null))),
    constraint content_items_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint content_items_topic_same_teacher_fkey
      foreign key (topic_id, teacher_id) references public.topics (id, teacher_id) on delete cascade
);
create index content_items_topic_id_idx on public.content_items (topic_id);

create table public.classroom_folders (
    id               uuid not null default gen_random_uuid(),
    teacher_id       uuid not null,
    name             text not null,
    parent_folder_id uuid,
    "position"       integer not null default 0,
    created_by       uuid,
    created_at       timestamptz default now(),
    constraint classroom_folders_pkey primary key (id),
    constraint classroom_folders_id_teacher_key unique (id, teacher_id),
    constraint classroom_folders_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null,
    constraint classroom_folders_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    -- self-referential composite FK; DEFERRABLE INITIALLY DEFERRED so multi-row tree
    -- seeds validate at commit regardless of row order.
    constraint classroom_folders_parent_same_teacher_fkey
      foreign key (parent_folder_id, teacher_id) references public.classroom_folders (id, teacher_id)
      on delete cascade deferrable initially deferred
);
create index classroom_folders_parent_folder_id_idx on public.classroom_folders (parent_folder_id);

create table public.classroom_recordings (
    id                      uuid not null default gen_random_uuid(),
    teacher_id              uuid not null,
    folder_id               uuid,
    title                   text not null,
    description             text,
    "position"              integer not null default 0,
    video_provider          text,
    video_id                text,
    video_status            text default 'pending',
    video_duration_seconds  integer,
    video_thumbnail_url     text,
    created_by              uuid,
    created_at              timestamptz default now(),
    constraint classroom_recordings_pkey primary key (id),
    constraint classroom_recordings_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null,
    constraint classroom_recordings_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint classroom_recordings_folder_same_teacher_fkey
      foreign key (folder_id, teacher_id) references public.classroom_folders (id, teacher_id) on delete cascade
);
create index classroom_recordings_folder_id_idx on public.classroom_recordings (folder_id);
create index classroom_recordings_video_id_idx  on public.classroom_recordings (video_id);

create table public.events (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    title       text not null,
    description text,
    starts_at   timestamptz not null,
    ends_at     timestamptz not null,
    location    text,
    meeting_url text,
    series_id   uuid,
    created_by  uuid,
    created_at  timestamptz default now(),
    constraint events_pkey primary key (id),
    constraint events_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null
);
create index events_starts_at_idx on public.events (teacher_id, starts_at);
create index events_series_id_idx on public.events (series_id);

-- newsletter_items (migration 0005) — a running, newest-first feed of curated links,
-- grouped by category on the public /home homepage. teacher_id + category_id are derived
-- server-side from the authoring admin's teacher (never client-chosen); category_id is
-- NOT NULL + ON DELETE CASCADE, which DIVERGES from teachers.category_id (nullable, SET
-- NULL): every item must live in a category, and a NOT NULL column can't be set null when
-- its category is deleted, so the item cascades with it. created_by → profiles for "added
-- by" attribution. No child tables, so no composite (id, teacher_id) unique key.
create table public.newsletter_items (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    category_id uuid not null,
    created_by  uuid,
    url         text not null,
    headline    text not null,
    blurb       text,
    created_at  timestamptz default now(),
    constraint newsletter_items_pkey primary key (id),
    constraint newsletter_items_teacher_id_fkey  foreign key (teacher_id)  references public.teachers(id),
    constraint newsletter_items_category_id_fkey foreign key (category_id) references public.categories(id) on delete cascade,
    constraint newsletter_items_created_by_fkey  foreign key (created_by)  references public.profiles(id) on delete set null
);
create index newsletter_items_category_created_idx on public.newsletter_items (category_id, created_at desc);
create index newsletter_items_teacher_idx on public.newsletter_items (teacher_id);


-- =============================================================================
-- SECTION 4 — leaf tables (no teacher_id; RLS joins to the parent)
-- =============================================================================
create table public.comments (
    id         uuid not null default gen_random_uuid(),
    post_id    uuid not null,
    author_id  uuid not null,
    body       text not null,
    created_at timestamptz default now(),
    constraint comments_pkey primary key (id),
    constraint comments_post_id_fkey   foreign key (post_id)   references public.posts(id)    on delete cascade,
    constraint comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade
);
create index comments_post_id_idx on public.comments (post_id);

create table public.post_images (
    id           uuid not null default gen_random_uuid(),
    post_id      uuid not null,
    url          text not null,
    storage_path text not null,
    "position"   smallint not null default 0,
    created_at   timestamptz default now(),
    constraint post_images_pkey primary key (id),
    constraint post_images_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade
);
create index post_images_post_id_idx on public.post_images (post_id);

create table public.post_attachments (
    id           uuid not null default gen_random_uuid(),
    post_id      uuid not null,
    url          text not null,
    storage_path text not null,
    file_name    text not null,
    file_size    bigint not null,
    "position"   integer not null default 0,
    created_at   timestamptz default now(),
    constraint post_attachments_pkey primary key (id),
    constraint post_attachments_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade
);
create index post_attachments_post_id_idx on public.post_attachments (post_id);

create table public.post_videos (
    id                     uuid not null default gen_random_uuid(),
    post_id                uuid not null,
    video_provider         text,
    video_id               text,
    video_status           text default 'pending',
    video_duration_seconds integer,
    video_thumbnail_url    text,
    created_at             timestamptz default now(),
    constraint post_videos_pkey primary key (id),
    constraint post_videos_post_id_key unique (post_id),
    constraint post_videos_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade
);
create index post_videos_post_id_idx  on public.post_videos (post_id);
create index post_videos_video_id_idx on public.post_videos (video_id);

create table public.post_likes (
    post_id    uuid not null,
    user_id    uuid not null,
    created_at timestamptz not null default now(),
    constraint post_likes_pkey primary key (post_id, user_id),
    constraint post_likes_post_id_fkey foreign key (post_id) references public.posts(id)    on delete cascade,
    constraint post_likes_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);
create index post_likes_post_id_idx on public.post_likes (post_id);
create index post_likes_user_id_idx on public.post_likes (user_id);

create table public.comment_likes (
    comment_id uuid not null,
    user_id    uuid not null,
    created_at timestamptz not null default now(),
    constraint comment_likes_pkey primary key (comment_id, user_id),
    constraint comment_likes_comment_id_fkey foreign key (comment_id) references public.comments(id) on delete cascade,
    constraint comment_likes_user_id_fkey    foreign key (user_id)    references public.profiles(id) on delete cascade
);
create index comment_likes_comment_id_idx on public.comment_likes (comment_id);
create index comment_likes_user_id_idx    on public.comment_likes (user_id);

create table public.content_progress (
    user_id         uuid not null,
    content_item_id uuid not null,
    completed_at    timestamptz not null default now(),
    constraint content_progress_pkey primary key (user_id, content_item_id),
    constraint content_progress_user_id_fkey         foreign key (user_id)         references public.profiles(id)      on delete cascade,
    constraint content_progress_content_item_id_fkey foreign key (content_item_id) references public.content_items(id) on delete cascade
);
create index content_progress_user_id_idx on public.content_progress (user_id);

create table public.classroom_recording_progress (
    user_id      uuid not null,
    recording_id uuid not null,
    completed_at timestamptz not null default now(),
    constraint classroom_recording_progress_pkey primary key (user_id, recording_id),
    constraint classroom_recording_progress_user_id_fkey      foreign key (user_id)      references public.profiles(id)             on delete cascade,
    constraint classroom_recording_progress_recording_id_fkey foreign key (recording_id) references public.classroom_recordings(id) on delete cascade
);
create index classroom_recording_progress_user_id_idx      on public.classroom_recording_progress (user_id);
create index classroom_recording_progress_recording_id_idx on public.classroom_recording_progress (recording_id);

-- classroom TIER TAGS (0006) — per-teacher labels that gate Topics. tags carries the
-- unique (id, teacher_id) that the child composite same-teacher FKs target. member_tags
-- keys (profile_id, tag_id) + denormalized teacher_id with TWO composite FKs so a
-- teacher-A tag can only be held by a member of A (structural, all roles — not RLS).
create table public.tags (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null,
    name        text not null,
    color       text,
    created_at  timestamptz default now(),
    constraint tags_pkey primary key (id),
    constraint tags_id_teacher_key unique (id, teacher_id),
    constraint tags_teacher_name_key unique (teacher_id, name),
    constraint tags_teacher_id_fkey foreign key (teacher_id) references public.teachers(id) on delete cascade
);
create index tags_teacher_id_idx on public.tags (teacher_id);

create table public.topic_tags (
    topic_id    uuid not null,
    tag_id      uuid not null,
    teacher_id  uuid not null,
    created_at  timestamptz default now(),
    constraint topic_tags_pkey primary key (topic_id, tag_id),
    constraint topic_tags_topic_same_teacher_fkey
      foreign key (topic_id, teacher_id) references public.topics (id, teacher_id) on delete cascade,
    constraint topic_tags_tag_same_teacher_fkey
      foreign key (tag_id, teacher_id) references public.tags (id, teacher_id) on delete cascade
);
create index topic_tags_topic_id_idx on public.topic_tags (topic_id);
create index topic_tags_tag_id_idx   on public.topic_tags (tag_id);

create table public.member_tags (
    profile_id  uuid not null,
    tag_id      uuid not null,
    teacher_id  uuid not null,
    created_at  timestamptz default now(),
    constraint member_tags_pkey primary key (profile_id, tag_id),
    constraint member_tags_membership_fkey
      foreign key (profile_id, teacher_id) references public.memberships (profile_id, teacher_id) on delete cascade,
    constraint member_tags_tag_same_teacher_fkey
      foreign key (tag_id, teacher_id) references public.tags (id, teacher_id) on delete cascade
);
create index member_tags_profile_idx on public.member_tags (profile_id);
create index member_tags_tag_id_idx  on public.member_tags (tag_id);

-- can_access_topic (0006) — a SECTION 2-style SECURITY DEFINER authz helper, but DEFINED
-- HERE because a language-sql function validates its body's table refs at creation, so it
-- must follow topic_tags/member_tags. Returns true when the topic has NO required tags
-- (NOT EXISTS → ungated = OPEN, structurally) OR the caller holds >=1 required tag.
create or replace function public.can_access_topic(p_topic_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select
    not exists (select 1 from public.topic_tags tt where tt.topic_id = p_topic_id)
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
-- SECTION 5 — handle_new_user + trigger  [D4: function call qualified to public.]
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- SECTION 6 — enable RLS (all 24 tables; force_rls = false)
-- =============================================================================
alter table public.categories                    enable row level security;
alter table public.teachers                     enable row level security;
alter table public.memberships                   enable row level security;
alter table public.profiles                       enable row level security;
alter table public.week_groups                    enable row level security;
alter table public.channels                        enable row level security;
alter table public.posts                            enable row level security;
alter table public.topics                           enable row level security;
alter table public.content_items                    enable row level security;
alter table public.classroom_folders                enable row level security;
alter table public.classroom_recordings             enable row level security;
alter table public.events                           enable row level security;
alter table public.newsletter_items                 enable row level security;
alter table public.comments                         enable row level security;
alter table public.post_images                      enable row level security;
alter table public.post_attachments                 enable row level security;
alter table public.post_videos                      enable row level security;
alter table public.post_likes                       enable row level security;
alter table public.comment_likes                    enable row level security;
alter table public.content_progress                 enable row level security;
alter table public.classroom_recording_progress     enable row level security;
alter table public.tags                              enable row level security;
alter table public.topic_tags                        enable row level security;
alter table public.member_tags                       enable row level security;


-- =============================================================================
-- SECTION 7 — grants  (pinned VERBATIM from live blocks 8 / 8b; RLS is the gate)
-- =============================================================================
-- Observed privilege model on community-mt-dev:
--   • authenticated: full 7 (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER)
--     on every table EXCEPT memberships and profiles.
--   • memberships: authenticated is WRITE-LESS (SELECT/REFERENCES/TRIGGER/TRUNCATE) —
--     membership writes go only through service-role / out-of-band tooling.
--   • profiles: authenticated has table INSERT/DELETE/SELECT/TRUNCATE/REFERENCES/TRIGGER
--     but NO table-level UPDATE; UPDATE is COLUMN-restricted to the four user-editable
--     columns. (INSERT/DELETE are inert — profiles has no insert/delete RLS policy.)
--   • anon: ZERO grants on live → explicit REVOKE so a fresh project's default
--     privileges cannot leave a stray anon grant (deterministic reproduction).
--   • service_role: full 7 on every table (RLS-bypassing by design).

-- authenticated — full CRUD (the 18 non-narrowed tables):
grant select, insert, update, delete, truncate, references, trigger on
  public.channels, public.classroom_folders, public.classroom_recording_progress,
  public.classroom_recordings, public.comment_likes, public.comments,
  public.content_items, public.content_progress, public.events,
  public.newsletter_items, public.post_attachments, public.post_images,
  public.post_likes, public.post_videos, public.posts, public.teachers,
  public.topics, public.week_groups
  to authenticated;

-- authenticated — memberships: write-LESS (no INSERT/UPDATE/DELETE). The explicit
-- REVOKE guarantees the write-less state even if the project's default privileges
-- auto-grant CRUD on new tables (else authenticated could self-insert a membership).
grant select, references, trigger, truncate on public.memberships to authenticated;
revoke insert, update, delete on public.memberships from authenticated;

-- authenticated — profiles: no table-level UPDATE; column-restricted UPDATE only.
-- REVOKE table UPDATE first (defaults may have granted it) so only the column grant remains.
grant select, insert, delete, truncate, references, trigger on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, bio, avatar_url, social_links) on public.profiles to authenticated;

-- service_role — full on everything (verified all-7 on all 19 tables)
grant all on all tables in schema public to service_role;

-- anon — zero table grants EXCEPT a narrow directory read on teachers (0002): revoke
-- everything first (live shows zero anon grants), then grant back only the public
-- directory columns. created_at and every other table stay closed to anon.
revoke all on all tables in schema public from anon;
grant select (id, slug, name, cover_url, logo_url, description, category_id) on public.teachers to anon;

-- categories (0004) — read-only reference data. authenticated + anon SELECT; anon EXCLUDES
-- created_at (mirrors the teachers anon-grant invariant). service_role covered by grant all.
grant select on public.categories to authenticated;
grant select (id, slug, name) on public.categories to anon;

-- newsletter_items (0005) — public feed. authenticated full CRUD is in the big block
-- above (RLS is the gate). anon gets a column-scoped SELECT; created_at is INTENTIONALLY
-- included (it's a display field for the newest-first feed, unlike the teachers/categories
-- anon grants which exclude it) — do NOT "fix" it out.
grant select (id, category_id, teacher_id, url, headline, blurb, created_at) on public.newsletter_items to anon;

-- tags / topic_tags / member_tags (0006) — authenticated full CRUD (RLS is the gate);
-- NO anon (classroom is member-only). service_role is already covered by the
-- "grant all on all tables in schema public to service_role" sweep above.
grant select, insert, update, delete, truncate, references, trigger on public.tags        to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.topic_tags  to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.member_tags to authenticated;

-- RPC EXECUTE — required for client rpc() calls
grant execute on function public.has_membership(uuid), public.is_teacher_admin(uuid)
  to anon, authenticated, service_role;
grant execute on function public.teacher_member_counts()
  to anon, authenticated, service_role;
grant execute on function public.can_access_topic(uuid)
  to anon, authenticated, service_role;


-- =============================================================================
-- SECTION 8 — RLS policies (public)
-- =============================================================================
create policy categories_select_all on public.categories for select to authenticated using (true);
create policy categories_select_anon on public.categories for select to anon using (true);

create policy teachers_select_all on public.teachers for select to authenticated using (true);
create policy teachers_select_anon on public.teachers for select to anon using (true);
create policy teachers_update_admin on public.teachers for update to authenticated
  using (is_teacher_admin(id)) with check (is_teacher_admin(id));

create policy memberships_select_self_or_comember on public.memberships
  for select to authenticated
  using (profile_id = auth.uid() or is_teacher_admin(teacher_id) or has_membership(teacher_id));

create policy profiles_select_self_or_comember on public.profiles
  for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m2.teacher_id = m1.teacher_id
    where m1.profile_id = auth.uid() and m1.status = 'active' and m2.profile_id = profiles.id));
create policy profiles_update_self on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- spine: member-read / admin-write
create policy week_groups_select        on public.week_groups for select to authenticated using (has_membership(teacher_id));
create policy week_groups_insert_admin  on public.week_groups for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy week_groups_update_admin  on public.week_groups for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy week_groups_delete_admin  on public.week_groups for delete to authenticated using (is_teacher_admin(teacher_id));

create policy channels_select        on public.channels for select to authenticated using (has_membership(teacher_id));
create policy channels_insert_admin  on public.channels for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy channels_update_admin  on public.channels for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy channels_delete_admin  on public.channels for delete to authenticated using (is_teacher_admin(teacher_id));

create policy topics_select        on public.topics for select to authenticated using (has_membership(teacher_id));
create policy topics_insert_admin  on public.topics for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy topics_update_admin  on public.topics for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy topics_delete_admin  on public.topics for delete to authenticated using (is_teacher_admin(teacher_id));

-- content_items SELECT gains the tag gate (0006): has_membership AND can_access_topic.
-- is_locked stays a route/UI lifecycle guard (never in RLS) — byte-identical to before.
create policy content_items_select        on public.content_items for select to authenticated using (has_membership(teacher_id) and can_access_topic(topic_id));
create policy content_items_insert_admin  on public.content_items for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy content_items_update_admin  on public.content_items for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy content_items_delete_admin  on public.content_items for delete to authenticated using (is_teacher_admin(teacher_id));

-- classroom TIER TAGS (0006) — member-read, admin-write (is_teacher_admin). The
-- content_items gate (can_access_topic) is SECURITY DEFINER and does NOT depend on
-- these SELECT policies; member-read exists only to power UI lock labels.
create policy tags_select        on public.tags for select to authenticated using (has_membership(teacher_id));
create policy tags_insert_admin  on public.tags for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy tags_update_admin  on public.tags for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy tags_delete_admin  on public.tags for delete to authenticated using (is_teacher_admin(teacher_id));

create policy topic_tags_select        on public.topic_tags for select to authenticated using (has_membership(teacher_id));
create policy topic_tags_insert_admin  on public.topic_tags for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy topic_tags_delete_admin  on public.topic_tags for delete to authenticated using (is_teacher_admin(teacher_id));

create policy member_tags_select_self_or_admin on public.member_tags for select to authenticated
  using (profile_id = auth.uid() or is_teacher_admin(teacher_id));
create policy member_tags_insert_admin on public.member_tags for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy member_tags_delete_admin on public.member_tags for delete to authenticated using (is_teacher_admin(teacher_id));

create policy classroom_folders_select        on public.classroom_folders for select to authenticated using (has_membership(teacher_id));
create policy classroom_folders_insert_admin  on public.classroom_folders for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy classroom_folders_update_admin  on public.classroom_folders for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy classroom_folders_delete_admin  on public.classroom_folders for delete to authenticated using (is_teacher_admin(teacher_id));

create policy classroom_recordings_select        on public.classroom_recordings for select to authenticated using (has_membership(teacher_id));
create policy classroom_recordings_insert_admin  on public.classroom_recordings for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy classroom_recordings_update_admin  on public.classroom_recordings for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy classroom_recordings_delete_admin  on public.classroom_recordings for delete to authenticated using (is_teacher_admin(teacher_id));

create policy events_select        on public.events for select to authenticated using (has_membership(teacher_id));
create policy events_insert_admin  on public.events for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy events_update_admin  on public.events for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy events_delete_admin  on public.events for delete to authenticated using (is_teacher_admin(teacher_id));

-- newsletter_items (0005): PUBLIC read (anon + authenticated); two-part admin write rule
-- (admin of the item's teacher AND item.category_id == that teacher's category_id). The
-- category-match subquery reads teachers (open to authenticated), so no SECURITY DEFINER
-- helper — mirrors the post_videos cross-table subquery. UPDATE/DELETE USING omit the
-- category match so an admin can always touch their own teacher's rows (a NULL-category
-- teacher is denied on write because `category_id = NULL` is never true).
create policy newsletter_items_select_all  on public.newsletter_items for select to authenticated using (true);
create policy newsletter_items_select_anon on public.newsletter_items for select to anon using (true);
create policy newsletter_items_insert_admin on public.newsletter_items for insert to authenticated
  with check (is_teacher_admin(teacher_id)
    and category_id = (select t.category_id from public.teachers t where t.id = newsletter_items.teacher_id));
create policy newsletter_items_update_admin on public.newsletter_items for update to authenticated
  using (is_teacher_admin(teacher_id))
  with check (is_teacher_admin(teacher_id)
    and category_id = (select t.category_id from public.teachers t where t.id = newsletter_items.teacher_id));
create policy newsletter_items_delete_admin on public.newsletter_items for delete to authenticated
  using (is_teacher_admin(teacher_id));

-- posts (member-create gated by channel permission OR admin)
create policy posts_select on public.posts for select to authenticated using (has_membership(teacher_id));
create policy posts_insert_channel_permitted on public.posts for insert to authenticated
  with check ((auth.uid() = author_id) and has_membership(teacher_id) and (
    (exists (select 1 from public.channels c where c.id = posts.channel_id and c.post_permission = 'all'))
    or is_teacher_admin(teacher_id)));
create policy posts_update_owner_or_admin on public.posts for update to authenticated
  using (((author_id = auth.uid()) and has_membership(teacher_id)) or is_teacher_admin(teacher_id))
  with check (((author_id = auth.uid()) and has_membership(teacher_id)) or is_teacher_admin(teacher_id));
create policy posts_delete_owner_or_admin on public.posts for delete to authenticated
  using (((author_id = auth.uid()) and has_membership(teacher_id)) or is_teacher_admin(teacher_id));

-- comments (1-hop → posts)
create policy comments_select on public.comments for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));
create policy comments_insert_own on public.comments for insert to authenticated
  with check (author_id = auth.uid() and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));
create policy comments_update_own on public.comments for update to authenticated
  using (author_id = auth.uid() and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)))
  with check (author_id = auth.uid() and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));
create policy comments_delete_own on public.comments for delete to authenticated
  using (author_id = auth.uid() and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));

-- post_images (own the post)
create policy post_images_select on public.post_images for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_images.post_id)));
create policy post_images_insert_own on public.post_images for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = auth.uid() and has_membership(p.teacher_id)));
create policy post_images_delete_own on public.post_images for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = auth.uid() and has_membership(p.teacher_id)));

-- post_attachments (own the post; no select policy — public-read bucket)
create policy post_attachments_select on public.post_attachments for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_attachments.post_id)));
create policy post_attachments_insert_own on public.post_attachments for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_attachments.post_id and p.author_id = auth.uid() and has_membership(p.teacher_id)));
create policy post_attachments_delete_own on public.post_attachments for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_attachments.post_id and p.author_id = auth.uid() and has_membership(p.teacher_id)));

-- post_videos (admin of the post's teacher — no author conjunct)
create policy post_videos_select on public.post_videos for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));
create policy post_videos_insert_admin on public.post_videos for insert to authenticated
  with check (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));
create policy post_videos_update_admin on public.post_videos for update to authenticated
  using (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)))
  with check (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));
create policy post_videos_delete_admin on public.post_videos for delete to authenticated
  using (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));

-- post_likes (own row)
create policy post_likes_select on public.post_likes for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_likes.post_id)));
create policy post_likes_insert_own on public.post_likes for insert to authenticated
  with check (user_id = auth.uid() and has_membership((select p.teacher_id from public.posts p where p.id = post_likes.post_id)));
create policy post_likes_delete_own on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- comment_likes (2-hop → comments → posts; own row)
create policy comment_likes_select on public.comment_likes for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p join public.comments c on c.post_id = p.id where c.id = comment_likes.comment_id)));
create policy comment_likes_insert_own on public.comment_likes for insert to authenticated
  with check (user_id = auth.uid() and has_membership((select p.teacher_id from public.posts p join public.comments c on c.post_id = p.id where c.id = comment_likes.comment_id)));
create policy comment_likes_delete_own on public.comment_likes for delete to authenticated using (user_id = auth.uid());

-- content_progress (own row + membership)
create policy content_progress_select_own on public.content_progress for select to authenticated
  using (user_id = auth.uid() and has_membership((select ci.teacher_id from public.content_items ci where ci.id = content_progress.content_item_id)));
create policy content_progress_insert_own on public.content_progress for insert to authenticated
  with check (user_id = auth.uid() and has_membership((select ci.teacher_id from public.content_items ci where ci.id = content_progress.content_item_id)));
create policy content_progress_delete_own on public.content_progress for delete to authenticated using (user_id = auth.uid());

-- classroom_recording_progress (own row + membership)
create policy crp_select_own on public.classroom_recording_progress for select to authenticated
  using (user_id = auth.uid() and has_membership((select r.teacher_id from public.classroom_recordings r where r.id = classroom_recording_progress.recording_id)));
create policy crp_insert_own on public.classroom_recording_progress for insert to authenticated
  with check (user_id = auth.uid() and has_membership((select r.teacher_id from public.classroom_recordings r where r.id = classroom_recording_progress.recording_id)));
create policy crp_delete_own on public.classroom_recording_progress for delete to authenticated using (user_id = auth.uid());


-- =============================================================================
-- SECTION 9 — storage.objects RLS  [D6: DROP IF EXISTS guards for re-run safety]
-- =============================================================================
-- Path scheme {teacher_id}/{uid}/...  post-images/post-attachments gate segment[1]
-- via has_membership AND segment[2] = uid. avatars is realigned to OWN-UID ONLY
-- ({uid}/avatar.jpg → segment[1] = auth.uid(); 0002). Admin buckets (topic-covers/
-- teacher-covers/teacher-logos/content-files) gate segment[1] via is_teacher_admin only.

-- avatars ({uid}/avatar.jpg) — public read; OWN-UID write (realigned in 0002, dropping
-- the old {teacher_id}/{uid}/... has_membership gate so the platform-level profile editor
-- writes with no teacher context). segment[1] = auth.uid() is the whole write check.
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated using (bucket_id = 'avatars');
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- post-images ({teacher_id}/{uid}/{post_id}/{pos}.jpg) — public read
drop policy if exists post_images_obj_select on storage.objects;
create policy post_images_obj_select on storage.objects for select to authenticated using (bucket_id = 'post-images');
drop policy if exists post_images_obj_insert_own on storage.objects;
create policy post_images_obj_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and has_membership(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists post_images_obj_delete_own on storage.objects;
create policy post_images_obj_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and has_membership(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2] = auth.uid()::text);

-- post-attachments ({teacher_id}/{uid}/...) — insert/delete only
drop policy if exists post_attachments_obj_insert_own on storage.objects;
create policy post_attachments_obj_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'post-attachments' and has_membership(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists post_attachments_obj_delete_own on storage.objects;
create policy post_attachments_obj_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'post-attachments' and has_membership(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2] = auth.uid()::text);

-- topic-covers ({teacher_id}/...) — admin write, member read
drop policy if exists topic_covers_select on storage.objects;
create policy topic_covers_select on storage.objects for select to authenticated using (bucket_id = 'topic-covers');
drop policy if exists topic_covers_insert_admin on storage.objects;
create policy topic_covers_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'topic-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists topic_covers_update_admin on storage.objects;
create policy topic_covers_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'topic-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists topic_covers_delete_admin on storage.objects;
create policy topic_covers_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'topic-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));

-- teacher-covers ({teacher_id}/...) — admin write, member read (0002; copy of topic-covers)
drop policy if exists teacher_covers_select on storage.objects;
create policy teacher_covers_select on storage.objects for select to authenticated using (bucket_id = 'teacher-covers');
drop policy if exists teacher_covers_insert_admin on storage.objects;
create policy teacher_covers_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'teacher-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_covers_update_admin on storage.objects;
create policy teacher_covers_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'teacher-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_covers_delete_admin on storage.objects;
create policy teacher_covers_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));

-- teacher-logos ({teacher_id}/...) — admin write, member read (0002; copy of topic-covers)
drop policy if exists teacher_logos_select on storage.objects;
create policy teacher_logos_select on storage.objects for select to authenticated using (bucket_id = 'teacher-logos');
drop policy if exists teacher_logos_insert_admin on storage.objects;
create policy teacher_logos_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'teacher-logos' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_logos_update_admin on storage.objects;
create policy teacher_logos_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'teacher-logos' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists teacher_logos_delete_admin on storage.objects;
create policy teacher_logos_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'teacher-logos' and is_teacher_admin(((storage.foldername(name))[1])::uuid));

-- content-files ({teacher_id}/...) — admin write, member read (public-read bucket: v1 gap)
drop policy if exists content_files_select on storage.objects;
create policy content_files_select on storage.objects for select to authenticated using (bucket_id = 'content-files');
drop policy if exists content_files_insert_admin on storage.objects;
create policy content_files_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'content-files' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists content_files_update_admin on storage.objects;
create policy content_files_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'content-files' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists content_files_delete_admin on storage.objects;
create policy content_files_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'content-files' and is_teacher_admin(((storage.foldername(name))[1])::uuid));

-- =============================================================================
-- SECTION 10 — account deletion (delete_my_account; restores the dump's gap)
-- =============================================================================
-- Multi-tenant rewrite of the single-tenant 0007 function (which referenced the
-- removed profiles.is_admin + single-tenant storage paths). Also lives as the
-- standalone hand-run migration 0001_delete_my_account_mt.sql.
--   • Admin rule OPTION A: block ONLY if deletion drops a teacher to zero active
--     admins (caller is its LAST active admin) -> 'last_admin' + teacher names.
--   • Memberships DELETEd explicitly (tombstoned profile is kept, so the
--     memberships -> profiles cascade never fires).
--   • Tombstone clears social_links (PII); no is_admin column under MT.
--   • Storage paths span every {teacher_id}/{uid}/... prefix (avatars parsed from
--     avatar_url; post-images + post-attachments from their storage_path columns).
-- SECURITY DEFINER + pinned search_path; no params (auth.uid() => self only).

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id           uuid;
  v_avatar_url        text;
  v_avatar_path       text;
  v_avatar_paths      text[] := '{}';
  v_post_image_paths  text[];
  v_post_attach_paths text[];
  v_orphan_teachers   text[];
begin
  -- Identify the caller from the JWT.
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- ADMIN RULE (Option A): block ONLY if deleting would leave some teacher with
  -- zero active admins (the caller is that teacher's LAST active admin). Collect
  -- the blocking teacher names so the UI message is actionable.
  select array_agg(t.name order by t.name)
    into v_orphan_teachers
  from public.memberships m
  join public.teachers t on t.id = m.teacher_id
  where m.profile_id = v_user_id
    and m.role = 'admin'
    and m.status = 'active'
    and (
      select count(*)
      from public.memberships m2
      where m2.teacher_id = m.teacher_id
        and m2.role = 'admin'
        and m2.status = 'active'
    ) = 1;  -- this caller is the only active admin of that teacher

  if v_orphan_teachers is not null and array_length(v_orphan_teachers, 1) > 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'last_admin',
      'teachers', to_jsonb(v_orphan_teachers)
    );
  end if;

  -- Read avatar URL for path parsing below.
  select avatar_url into v_avatar_url
  from public.profiles
  where id = v_user_id;

  -- Avatar: PARSE the in-bucket path out of the public URL (MT prefix is
  -- {teacher_id}/{uid}/avatar.jpg — never reconstruct from convention). The URL
  -- is .../object/public/avatars/<path>[?v=...]; take the part after '/avatars/'
  -- and strip any query string.
  if v_avatar_url is not null then
    v_avatar_path := split_part(substring(v_avatar_url from '/avatars/(.*)$'), '?', 1);
    if v_avatar_path is not null and v_avatar_path <> '' then
      v_avatar_paths := array[v_avatar_path];
    end if;
  end if;

  -- post-images + post-attachments: storage_path already holds the full
  -- {teacher_id}/{uid}/... path, so these span every teacher with no per-prefix
  -- logic. (0007 missed post_attachments entirely — it is MT-era.)
  select coalesce(array_agg(pi.storage_path), '{}')
    into v_post_image_paths
  from public.post_images pi
  join public.posts p on p.id = pi.post_id
  where p.author_id = v_user_id;

  select coalesce(array_agg(pa.storage_path), '{}')
    into v_post_attach_paths
  from public.post_attachments pa
  join public.posts p on p.id = pa.post_id
  where p.author_id = v_user_id;

  -- (1) Tombstone the profile (KEPT so posts/comments across ALL teachers keep
  --     rendering "[Deleted user]"). Clear PII incl. social_links. No is_admin.
  update public.profiles
     set display_name = '[Deleted user]',
         avatar_url   = null,
         bio          = null,
         social_links = '{}'::jsonb,
         deleted_at   = now()
   where id = v_user_id;

  -- (2) Remove post media ROWS for this user's posts (files removed by caller).
  delete from public.post_images
   where post_id in (select id from public.posts where author_id = v_user_id);
  delete from public.post_attachments
   where post_id in (select id from public.posts where author_id = v_user_id);

  -- (3) Progress tables.
  delete from public.content_progress where user_id = v_user_id;
  delete from public.classroom_recording_progress where user_id = v_user_id;

  -- (4) Memberships: DELETE explicitly (the tombstoned profile is kept, so the
  --     memberships -> profiles cascade never fires).
  delete from public.memberships where profile_id = v_user_id;

  -- (No created_by null-out: under MT classroom_folders/recordings/events
  --  .created_by are ON DELETE SET NULL -> profiles, and the profile is kept,
  --  so nothing blocks the auth.users delete. 0007's defensive step is dead.)

  -- (5) Delete the auth user (revokes sessions, frees the email). Profile
  --     survives (no profiles -> auth.users FK); GoTrue cascades sessions/
  --     identities/refresh_tokens.
  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'storage_paths', jsonb_build_object(
      'avatars', to_jsonb(v_avatar_paths),
      'post-images', to_jsonb(v_post_image_paths),
      'post-attachments', to_jsonb(v_post_attach_paths)
    )
  );
end;
$$;

grant execute on function public.delete_my_account() to authenticated;


-- =============================================================================
-- End of multitenant/schema.sql. Run multitenant/seed.sql next.
-- =============================================================================
