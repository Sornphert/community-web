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
-- Migration 0007 (set_membership_role RPC — promote/demote with last-active-admin guard)
-- is FOLDED IN below as SECTION 11; see 0007_membership_roles.sql (standalone, hand-run).
-- Migration 0008 (memberships 'pending' status + source column; tightened co-member
-- policy; request_membership + set_membership_status RPCs) is FOLDED IN below; see
-- 0008_membership_onboarding.sql (standalone, hand-run).
-- Migration 0009 (revoke_membership RPC — active->revoked + demote-to-member atomically,
-- last-admin guard) is FOLDED IN below; see 0009_membership_revoke.sql (standalone).
-- Migration 0010 (can_access_topic SUPERSEDED — is_teacher_admin bypass as first
-- disjunct) is FOLDED IN below at the SECTION 4 definition; see 0010_topic_admin_bypass.sql.
-- Migration 0011 (opt-in public posts: is_public/hidden_from_public/featured columns,
-- public_posts_feed SECURITY DEFINER RPC as the SOLE anon read path, column-scoped
-- authenticated UPDATE) is FOLDED IN below as SECTION 12; see 0011_public_posts.sql.
-- Migration 0012 (posts INSERT narrowed to six content columns — closes self-feature/
-- self-publish and created_at backdating via raw PostgREST) is FOLDED IN below in
-- SECTION 7; see 0012_posts_insert_grant.sql (standalone, hand-run).
-- Migration 0013 (in-app notifications: notifications table + own-only RLS + the
-- SECURITY DEFINER mention/comment/like triggers that are its only writers + realtime
-- publication) is FOLDED IN below — table in SECTION 4, machinery in SECTION 13; see
-- 0013_notifications.sql (standalone, hand-run).
-- Migration 0014 (push_subscriptions — web-push endpoints, own-only RLS) is FOLDED IN
-- below in SECTION 4; see 0014_push_subscriptions.sql (standalone, hand-run).
-- Migration 0015 (teachers.website_url + anon column grant, for the locked-community
-- info modal) is FOLDED IN below; see 0015_teacher_website.sql (standalone, hand-run).
-- Migration 0016 (delete_my_account now purges notifications + push_subscriptions — the
-- profiles cascade never fires because the profile is TOMBSTONED; plus explicit grants
-- for both tables, which 0013/0014 shipped without) is FOLDED IN below across SECTIONS
-- 7 and 10; see 0016_notifications_deletion_and_grants.sql (standalone, hand-run).
-- Migration 0017 (public author profiles: public_posts_feed gains an author_id return
-- column + p_author_id filter — a DROP+CREATE; new public_member_header RPC; both
-- anon-granted) is FOLDED IN below in SECTION 12; see 0017_public_member_profile.sql
-- (standalone, hand-run).
-- Migration 0018 (public_posts_feed returns image_url — the absolute post_images.url —
-- instead of image_path, so imported content's images resolve) is FOLDED IN below in
-- SECTION 12; see 0018_public_feed_absolute_image_url.sql (standalone, hand-run).
-- Migration 0019 (content-files bucket flipped PRIVATE + storage SELECT narrowed from
-- any-authenticated to active-member-of-owning-teacher; reads become signed urls) is
-- FOLDED IN below in SECTION 9, with the bucket flag in seed.sql; see
-- 0019_content_files_private.sql (standalone, hand-run).
-- Migration 0020 (post-attachments bucket flipped PRIVATE + a storage SELECT policy
-- ADDED — none existed, since a public bucket never consulted RLS; reads become signed
-- urls) is FOLDED IN below in SECTION 9, with the bucket flag in seed.sql; see
-- 0020_post_attachments_private.sql (standalone, hand-run).
-- Migration 0021 (teachers.hero_url — per-teacher Announcements banner; the global
-- HERO_URL env var becomes the fallback) is FOLDED IN below in SECTION 0; see
-- 0021_teacher_hero.sql (standalone, hand-run).
-- Migration 0022 (public_posts_feed gains p_category_slug so the homepage feed can be
-- filtered by category via chips; a 'property' category is added and Jane reassigned to
-- it) is FOLDED IN below in SECTION 12; see 0022_public_feed_category_filter.sql
-- (standalone, hand-run). The 'property' category row lives in seed.sql.
-- Migration 0023 (public_posts_feed returns post_id; new public_post(id) RPC for the
-- public /p/[id] detail page — same public gate, comment_count only) is FOLDED IN below
-- in SECTION 12; see 0023_public_post_detail.sql (standalone, hand-run).
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
    -- Announcements banner (0021). NULL → the global HERO_URL env var, which is what
    -- single-tenant deployments use. Before 0021 that env var was the ONLY source, so
    -- every MT tenant rendered the same banner.
    hero_url    text,
    description text,
    website_url text,
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
    source      text,
    created_at  timestamptz default now(),
    constraint memberships_pkey primary key (id),
    constraint memberships_profile_teacher_key unique (profile_id, teacher_id),
    constraint memberships_role_check   check (role   = any (array['member','admin'])),
    constraint memberships_status_check check (status = any (array['active','revoked','pending'])),
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
    -- Pinned to the top of its channel by an admin (0031). null = not pinned.
    -- Written ONLY via set_post_pinned (admin-gated); excluded from the write grants.
    pinned_at   timestamptz,
    -- Public visibility (0011). Private default: every row starts members-only.
    -- is_public = author consent; hidden_from_public = admin kill switch;
    -- featured = admin prominence. Written ONLY via the set_post_* RPCs (the
    -- authenticated INSERT and UPDATE grants in SECTION 7 exclude these three columns).
    is_public          boolean not null default false,
    hidden_from_public boolean not null default false,
    featured           boolean not null default false,
    constraint posts_pkey primary key (id),
    constraint posts_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint posts_author_id_fkey  foreign key (author_id)  references public.profiles(id) on delete cascade,
    constraint posts_channel_same_teacher_fkey
      foreign key (channel_id, teacher_id) references public.channels (id, teacher_id)
);
create index posts_created_at_idx on public.posts (teacher_id, created_at desc);
create index posts_channel_id_idx on public.posts (channel_id);
create index posts_channel_pinned_idx on public.posts (channel_id, pinned_at desc nulls last, created_at desc);
create index posts_author_id_idx  on public.posts (author_id);
-- Public feed (0011): partial index matching public_posts_feed()'s hard WHERE.
create index posts_public_feed_idx on public.posts (teacher_id, created_at desc)
  where is_public and not hidden_from_public;

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
    -- 0037: Bunny-uploaded video lessons (mirror classroom_recordings video_* cols).
    video_provider         text,
    video_id               text,
    video_status           text,
    video_duration_seconds integer,
    video_thumbnail_url    text,
    -- 0039: nested lesson folder (FK added after lesson_folders is defined below).
    folder_id              uuid,
    "position"             smallint not null default 0,
    created_at             timestamptz default now(),
    constraint content_items_pkey primary key (id),
    constraint content_items_type_check check (type = any (array['video','document'])),
    -- 0037: a video item is valid with EITHER an external video_url OR a Bunny video_id.
    constraint content_items_payload_check check (
      ((type = 'video') and ((video_url is not null) or (video_id is not null))) or
      ((type = 'document') and (document_url is not null))),
    constraint content_items_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint content_items_topic_same_teacher_fkey
      foreign key (topic_id, teacher_id) references public.topics (id, teacher_id) on delete cascade
);
create index content_items_topic_id_idx on public.content_items (topic_id);
create index content_items_video_id_idx on public.content_items (video_id);

-- lesson_folders (0039) — nested folders (≤3 deep, app-enforced) for a topic's
-- lessons. content_items.folder_id (FK below) places a lesson in a folder; null =
-- topic root. Deleting a folder cascades sub-folders; its lessons fall back to root.
create table public.lesson_folders (
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
create index lesson_folders_topic_idx  on public.lesson_folders (topic_id);
create index lesson_folders_parent_idx on public.lesson_folders (parent_folder_id);
-- 0039: content_items.folder_id FK, added here because lesson_folders is defined
-- after content_items. On folder delete, the lesson moves to the topic root.
alter table public.content_items add constraint content_items_folder_fkey
  foreign key (folder_id) references public.lesson_folders(id) on delete set null;

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
    -- 0027: per-milestone reminder dedupe stamps (24h/8h/1h before starts_at).
    reminded_24h_at timestamptz,
    reminded_8h_at  timestamptz,
    reminded_1h_at  timestamptz,
    constraint events_pkey primary key (id),
    constraint events_teacher_id_fkey foreign key (teacher_id) references public.teachers(id),
    constraint events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null
);
create index events_starts_at_idx on public.events (teacher_id, starts_at);
create index events_series_id_idx on public.events (series_id);

-- event_rsvps (0028) — one row per attending member. Reads gated by membership of
-- the event's teacher; writes own-only. No teacher_id column — tenancy flows via event.
create table public.event_rsvps (
    event_id   uuid not null,
    user_id    uuid not null,
    created_at timestamptz default now(),
    constraint event_rsvps_pkey primary key (event_id, user_id),
    constraint event_rsvps_event_fkey foreign key (event_id) references public.events(id)   on delete cascade,
    constraint event_rsvps_user_fkey  foreign key (user_id)  references public.profiles(id) on delete cascade
);
create index event_rsvps_event_idx on public.event_rsvps (event_id);

-- saved_posts (0029) — a member's private bookmarks. Own-only RLS; reading the list
-- joins posts (membership-gated), so a post the user can no longer see drops out.
create table public.saved_posts (
    user_id    uuid not null,
    post_id    uuid not null,
    created_at timestamptz default now(),
    constraint saved_posts_pkey primary key (user_id, post_id),
    constraint saved_posts_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
    constraint saved_posts_post_fkey foreign key (post_id) references public.posts(id)    on delete cascade
);
create index saved_posts_user_idx on public.saved_posts (user_id, created_at desc);

-- post_reactions (0032) — emoji reactions on a post. Composite PK (post_id, user_id,
-- emoji) allows one row per emoji per user; presence means "reacted." SELECT is
-- membership-gated via the post's teacher; insert/delete are own-only.
create table public.post_reactions (
    post_id    uuid not null,
    user_id    uuid not null,
    emoji      text not null,
    created_at timestamptz default now(),
    constraint post_reactions_pkey primary key (post_id, user_id, emoji),
    constraint post_reactions_emoji_check check (char_length(emoji) between 1 and 16),
    constraint post_reactions_post_fkey foreign key (post_id) references public.posts(id)    on delete cascade,
    constraint post_reactions_user_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);
create index post_reactions_post_idx on public.post_reactions (post_id);

-- channel_reads (0036) — per-user, per-channel "last read" mark; drives the unread
-- dot on channels. Own-only RLS; upserted client-side when a channel is opened.
create table public.channel_reads (
    user_id      uuid not null,
    channel_id   uuid not null,
    last_read_at timestamptz not null default now(),
    constraint channel_reads_pkey primary key (user_id, channel_id),
    constraint channel_reads_user_fkey    foreign key (user_id)    references public.profiles(id) on delete cascade,
    constraint channel_reads_channel_fkey foreign key (channel_id) references public.channels(id) on delete cascade
);

-- polls (0033) — a poll attached to exactly one post (post_id UNIQUE). Options are
-- ordered rows; a vote is one (option_id, user_id) row. Single- vs multi-choice is
-- a flag; single-choice is enforced in the app. All three tables are membership-
-- gated for SELECT via the owning post's teacher; writes are own-only.
create table public.polls (
    id             uuid primary key default gen_random_uuid(),
    post_id        uuid not null unique,
    allow_multiple boolean not null default false,
    closes_at      timestamptz,
    created_at     timestamptz default now(),
    constraint polls_post_fkey foreign key (post_id) references public.posts(id) on delete cascade
);
create table public.poll_options (
    id         uuid primary key default gen_random_uuid(),
    poll_id    uuid not null,
    text       text not null,
    position   integer not null,
    created_at timestamptz default now(),
    constraint poll_options_text_check check (char_length(text) between 1 and 200),
    constraint poll_options_poll_fkey foreign key (poll_id) references public.polls(id) on delete cascade
);
create index poll_options_poll_idx on public.poll_options (poll_id, position);
create table public.poll_votes (
    poll_id    uuid not null,
    option_id  uuid not null,
    user_id    uuid not null,
    created_at timestamptz default now(),
    constraint poll_votes_pkey primary key (option_id, user_id),
    constraint poll_votes_poll_fkey   foreign key (poll_id)   references public.polls(id)        on delete cascade,
    constraint poll_votes_option_fkey foreign key (option_id) references public.poll_options(id) on delete cascade,
    constraint poll_votes_user_fkey   foreign key (user_id)   references public.profiles(id)     on delete cascade
);
create index poll_votes_poll_idx on public.poll_votes (poll_id);

-- join_tokens (0030) — per-teacher random invite token. Own table so `select *`
-- on teachers stays token-free; NO client read (resolved via SECURITY DEFINER RPCs
-- in SECTION 15) so a member can't harvest other communities' invite links.
create table public.join_tokens (
    teacher_id uuid primary key references public.teachers(id) on delete cascade,
    token      text not null unique
                 default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
    created_at timestamptz default now()
);

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
    edited_at  timestamptz, -- 0026: set by updateComment; null = never edited
    constraint comments_pkey primary key (id),
    constraint comments_post_id_fkey   foreign key (post_id)   references public.posts(id)    on delete cascade,
    constraint comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade
);
create index comments_post_id_idx on public.comments (post_id);

-- comment_images (0026) — images attached to a comment; mirrors post_images.
-- storage_path: {user_id}/{comment_id}/{position}.jpg in the public comment-images bucket.
create table public.comment_images (
    id           uuid not null default gen_random_uuid(),
    comment_id   uuid not null,
    url          text not null,
    storage_path text not null,
    "position"   integer not null default 0,
    created_at   timestamptz default now(),
    constraint comment_images_pkey primary key (id),
    constraint comment_images_comment_id_fkey foreign key (comment_id) references public.comments(id) on delete cascade
);
create index comment_images_comment_idx on public.comment_images (comment_id, "position");

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

-- notifications (0013) — one row per (recipient, event). Carries teacher_id like a
-- SECTION 3 spine table, but DEFINED HERE because it FKs comments, a SECTION 4 leaf.
-- Rows are written ONLY by the SECURITY DEFINER triggers in SECTION 13 — there is no
-- authenticated INSERT policy AND no INSERT grant (0016), so a client holding the anon
-- key cannot forge a notification for anyone. Recipients are always resolved through
-- active, non-tombstoned memberships of teacher_id, so a row never crosses a tenant.
create table public.notifications (
    id           uuid not null default gen_random_uuid(),
    teacher_id   uuid not null,
    recipient_id uuid not null,
    actor_id     uuid,
    type         text not null,
    post_id      uuid,
    comment_id   uuid,
    event_id     uuid, -- 0027: set on 'event_reminder' rows
    thread_id    uuid, -- 0035: set on 'direct_message' rows (FK added after dm_threads)
    read_at      timestamptz,
    created_at   timestamptz not null default now(),
    constraint notifications_pkey primary key (id),
    constraint notifications_type_check check (
      type = any (array['mention','mention_all','post_comment','post_like','comment_like','event_reminder','direct_message'])
    ),
    constraint notifications_teacher_fkey
      foreign key (teacher_id)   references public.teachers(id) on delete cascade,
    constraint notifications_recipient_fkey
      foreign key (recipient_id) references public.profiles(id) on delete cascade,
    constraint notifications_actor_fkey
      foreign key (actor_id)     references public.profiles(id) on delete set null,
    constraint notifications_post_fkey
      foreign key (post_id)      references public.posts(id)    on delete cascade,
    constraint notifications_comment_fkey
      foreign key (comment_id)   references public.comments(id) on delete cascade,
    constraint notifications_event_fkey
      foreign key (event_id)     references public.events(id)   on delete cascade
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;

-- push_subscriptions (0014) — one row per browser push endpoint; a user may hold
-- several (phone, laptop, …). No teacher_id: a subscription is per-DEVICE, not per-
-- community, and the send path resolves tenancy from the notifications row it is
-- delivering. RLS is own-only; the send path (app/api/push/send) reads and prunes
-- dead endpoints with the RLS-bypassing service_role client.
-- NOTE (0016): the profiles FK below is ON DELETE CASCADE but delete_my_account
-- TOMBSTONES the profile rather than deleting it, so this cascade never fires —
-- SECTION 10 deletes these rows explicitly. Do not "simplify" that away.
create table public.push_subscriptions (
    id         uuid not null default gen_random_uuid(),
    user_id    uuid not null,
    endpoint   text not null,
    p256dh     text not null,
    auth       text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    constraint push_subscriptions_pkey primary key (id),
    constraint push_subscriptions_endpoint_key unique (endpoint),
    constraint push_subscriptions_user_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- follows (0024) — platform-wide social graph: follower_id follows following_id,
-- independent of any teacher. Powers follower/following counts + lists on profiles
-- and the "Following" feed. Both FKs are ON DELETE CASCADE, but delete_my_account
-- TOMBSTONES the profile (keeps the row), so the cascade never fires and a deleted
-- user's follow rows persist — intentional: every follow READ joins profiles and
-- filters deleted_at is null, so tombstoned users are never shown or counted (same
-- as the members list). No delete_my_account change is needed.
create table public.follows (
    follower_id  uuid not null,
    following_id uuid not null,
    created_at   timestamptz not null default now(),
    constraint follows_pkey primary key (follower_id, following_id),
    constraint follows_no_self check (follower_id <> following_id),
    constraint follows_follower_fkey
      foreign key (follower_id)  references public.profiles(id) on delete cascade,
    constraint follows_following_fkey
      foreign key (following_id) references public.profiles(id) on delete cascade
);
create index follows_follower_idx  on public.follows (follower_id, created_at desc);
create index follows_following_idx on public.follows (following_id, created_at desc);

-- dm_threads / dm_messages (0034) — 1:1 direct messages, SAME-COMMUNITY only. A
-- thread is teacher-scoped and canonicalized (user_a < user_b) with UNIQUE(teacher,
-- pair). Read state is two per-thread "last read" timestamps. Clients get SELECT
-- only; all writes go through the SECURITY DEFINER RPCs in SECTION 16, which enforce
-- co-membership. See 0034_direct_messages.sql.
create table public.dm_threads (
    id                  uuid primary key default gen_random_uuid(),
    teacher_id          uuid not null,
    user_a              uuid not null,
    user_b              uuid not null,
    user_a_last_read_at timestamptz,
    user_b_last_read_at timestamptz,
    last_message_at     timestamptz default now(),
    created_at          timestamptz default now(),
    constraint dm_threads_pair_order check (user_a < user_b),
    constraint dm_threads_unique unique (teacher_id, user_a, user_b),
    constraint dm_threads_teacher_fkey foreign key (teacher_id) references public.teachers(id) on delete cascade,
    constraint dm_threads_user_a_fkey  foreign key (user_a)     references public.profiles(id) on delete cascade,
    constraint dm_threads_user_b_fkey  foreign key (user_b)     references public.profiles(id) on delete cascade
);
create index dm_threads_user_a_idx on public.dm_threads (user_a, last_message_at desc);
create index dm_threads_user_b_idx on public.dm_threads (user_b, last_message_at desc);
create table public.dm_messages (
    id         uuid primary key default gen_random_uuid(),
    thread_id  uuid not null,
    sender_id  uuid not null,
    body       text not null,
    created_at timestamptz default now(),
    constraint dm_messages_body_check check (char_length(body) between 1 and 4000),
    constraint dm_messages_thread_fkey foreign key (thread_id) references public.dm_threads(id) on delete cascade,
    constraint dm_messages_sender_fkey foreign key (sender_id) references public.profiles(id)   on delete cascade
);
create index dm_messages_thread_idx on public.dm_messages (thread_id, created_at);

-- 0035: notifications.thread_id FK, added here because dm_threads is defined after
-- the notifications table. Set on 'direct_message' rows to deep-link to the thread.
alter table public.notifications add constraint notifications_thread_fkey
  foreign key (thread_id) references public.dm_threads(id) on delete cascade;

-- can_access_topic (0006; admin bypass added in 0010) — a SECTION 2-style SECURITY DEFINER
-- authz helper, but DEFINED HERE because a language-sql function validates its body's table
-- refs at creation, so it must follow topic_tags/member_tags. Returns true when the caller
-- is the topic's teacher-admin (0010: tags gate MEMBERS into tiers, never an admin out of
-- their OWN content) OR the topic has NO required tags (NOT EXISTS → ungated = OPEN,
-- structurally) OR the caller holds >=1 required tag. 0010 SUPERSEDES 0006's body; the two
-- tag disjuncts are byte-identical to 0006, so the non-admin path is unchanged.
create or replace function public.can_access_topic(p_topic_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select
    -- ADMIN BYPASS (0010): teacher_id derived from the topic; is_teacher_admin(null)=false
    -- makes a bogus topic_id safe (falls through to the unchanged tag logic below).
    is_teacher_admin((select t.teacher_id from public.topics t where t.id = p_topic_id))
    or not exists (select 1 from public.topic_tags tt where tt.topic_id = p_topic_id)
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
-- SECTION 6 — enable RLS (all 26 tables; force_rls = false)
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
alter table public.lesson_folders                   enable row level security;
alter table public.classroom_folders                enable row level security;
alter table public.classroom_recordings             enable row level security;
alter table public.events                           enable row level security;
alter table public.newsletter_items                 enable row level security;
alter table public.comments                         enable row level security;
alter table public.comment_images                   enable row level security;
alter table public.event_rsvps                      enable row level security;
alter table public.saved_posts                      enable row level security;
alter table public.post_reactions                   enable row level security;
alter table public.channel_reads                    enable row level security;
alter table public.polls                            enable row level security;
alter table public.poll_options                     enable row level security;
alter table public.poll_votes                       enable row level security;
alter table public.join_tokens                      enable row level security;
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
alter table public.notifications                     enable row level security;
alter table public.push_subscriptions                enable row level security;
alter table public.follows                           enable row level security;
alter table public.dm_threads                        enable row level security;
alter table public.dm_messages                       enable row level security;


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
  public.lesson_folders, public.newsletter_items, public.post_attachments,
  public.post_images, public.post_likes, public.post_videos, public.posts,
  public.teachers, public.topics, public.week_groups
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

-- authenticated — posts: column-restricted UPDATE (0011). The blanket combined grant
-- above conferred UPDATE on posts; REVOKE it and re-grant UPDATE on CONTENT columns
-- only, so is_public/hidden_from_public/featured are unreachable by a direct client
-- UPDATE and move ONLY through the set_post_* RPCs. MUST stay AFTER the blanket grant
-- (a fresh rebuild would otherwise silently re-open the flag columns). Row eligibility
-- is still governed by the unchanged posts_update_owner_or_admin policy.
revoke update on public.posts from authenticated;
grant  update (title, body, edited_at) on public.posts to authenticated;

-- authenticated — posts: column-restricted INSERT (0012). The blanket combined grant
-- above conferred INSERT on posts; REVOKE it and re-grant INSERT on the six CONTENT
-- columns the composer sets, so is_public/hidden_from_public/featured are un-nameable
-- by a direct client INSERT (they take DEFAULT false and move ONLY through the
-- set_post_* RPCs). edited_at/created_at are also excluded — edited_at is never set on
-- create, and dropping created_at stops a member backdating a post via raw INSERT. MUST
-- stay AFTER the blanket grant (a fresh rebuild would otherwise silently re-open the
-- columns). Row eligibility is still governed by the unchanged
-- posts_insert_channel_permitted policy.
revoke insert on public.posts from authenticated;
grant  insert (id, author_id, teacher_id, title, body, channel_id) on public.posts to authenticated;

-- service_role — full on everything (verified all-7 on all 19 tables)
grant all on all tables in schema public to service_role;

-- anon — zero table grants EXCEPT a narrow directory read on teachers (0002): revoke
-- everything first (live shows zero anon grants), then grant back only the public
-- directory columns. created_at and every other table stay closed to anon.
revoke all on all tables in schema public from anon;
grant select (id, slug, name, cover_url, logo_url, description, website_url, category_id) on public.teachers to anon;

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

-- notifications (0013; grants pinned in 0016) — SELECT / UPDATE (mark read) / DELETE
-- for the recipient, RLS own-only is the gate. INSERT is REVOKED: rows are written
-- ONLY by the SECTION 13 SECURITY DEFINER triggers. The absence of an INSERT *policy*
-- already blocks a client insert; the REVOKE also closes it at the privilege layer and
-- survives a rebuild where default privileges grant CRUD on new tables (same reasoning
-- as the memberships write-less grant above). MUST stay AFTER any blanket grant.
grant select, update, delete, truncate, references, trigger
  on public.notifications to authenticated;
revoke insert on public.notifications from authenticated;

-- push_subscriptions (0014; grants pinned in 0016) — full CRUD for the owner:
-- lib/push/client.ts upserts (INSERT+UPDATE) on subscribe and DELETEs by endpoint on
-- unsubscribe. RLS own-only is the gate. The send path uses service_role, covered by
-- the grant-all sweep above.
grant select, insert, update, delete, truncate, references, trigger
  on public.push_subscriptions to authenticated;

-- anon — zero on both (signed-in surfaces only; neither is in the public-feed path).
-- Redundant with the wholesale anon revoke above but stated explicitly so the intent
-- survives a future reordering of this section.
revoke all on public.notifications      from anon;
revoke all on public.push_subscriptions from anon;

-- follows (0024) — authenticated may SELECT (platform-wide counts/lists), INSERT
-- (follow) and DELETE (unfollow); RLS scopes writes to your own follower_id and a
-- non-tombstoned target. No UPDATE (a follow has no mutable state). anon gets nothing
-- (the follow UI is in-app, behind auth).
grant select, insert, delete on public.follows to authenticated;
revoke all on public.follows from anon;

-- dm_threads / dm_messages (0034) — clients get SELECT only (participant-scoped by
-- RLS); every write goes through the SECURITY DEFINER RPCs in SECTION 16. anon nothing.
grant select on public.dm_threads  to authenticated, service_role;
grant select on public.dm_messages to authenticated, service_role;
revoke all on public.dm_threads  from anon;
revoke all on public.dm_messages from anon;

-- post_reactions (0032) — authenticated may react (INSERT) and un-react (DELETE);
-- RLS scopes writes to your own user_id and a post you can see. No UPDATE. anon
-- gets nothing (reactions are an in-app, members-only surface).
grant select, insert, delete on public.post_reactions to authenticated, service_role;
revoke all on public.post_reactions from anon;

-- channel_reads (0036) — own-only read marks; anon nothing.
grant select, insert, update, delete on public.channel_reads to authenticated, service_role;
revoke all on public.channel_reads from anon;

-- polls (0033) — poll + options are author-created and read-only thereafter; votes
-- are own insert/delete. anon has nothing (polls are an in-app, members-only surface).
grant select, insert on public.polls        to authenticated, service_role;
grant select, insert on public.poll_options to authenticated, service_role;
grant select, insert, delete on public.poll_votes to authenticated, service_role;
revoke all on public.polls        from anon;
revoke all on public.poll_options from anon;
revoke all on public.poll_votes   from anon;

-- comment_images (0026) — authenticated CRUD (RLS gates writes to the owning comment);
-- anon has nothing (members-only surface).
grant select, insert, update, delete on public.comment_images to authenticated;
revoke all on public.comment_images from anon;

-- event_rsvps (0028) — authenticated SELECT/INSERT/DELETE (RLS gates to membership +
-- own row); anon nothing.
grant select, insert, delete on public.event_rsvps to authenticated;
revoke all on public.event_rsvps from anon;

-- saved_posts (0029) — own-only bookmarks; anon nothing.
grant select, insert, delete on public.saved_posts to authenticated;
revoke all on public.saved_posts from anon;

-- join_tokens (0030) — clients get NOTHING (tokens are read only via definer RPCs);
-- service_role for admin tooling. RLS is on with no policy, so even the grant-less
-- state is belt-and-suspenders.
revoke all on public.join_tokens from anon, authenticated;
grant all on public.join_tokens to service_role;

-- RPC EXECUTE — required for client rpc() calls
grant execute on function public.has_membership(uuid), public.is_teacher_admin(uuid)
  to anon, authenticated, service_role;
grant execute on function public.teacher_member_counts()
  to anon, authenticated, service_role;
grant execute on function public.can_access_topic(uuid)
  to anon, authenticated, service_role;
-- Public posts (0011): flag RPCs authenticated-only (internal authz gates them);
-- the read feed is the ONLY anon path into public posts. public_member_header (0017)
-- is anon too — it backs the public author profile page.
grant execute on function public.set_post_public(uuid, boolean)   to authenticated;
grant execute on function public.set_post_hidden(uuid, boolean)   to authenticated;
grant execute on function public.set_post_featured(uuid, boolean) to authenticated;
grant execute on function public.public_posts_feed(int, int, uuid, uuid, text) to anon, authenticated;
grant execute on function public.public_member_header(uuid, uuid) to anon, authenticated;

-- 0025 — GLOBAL follow helpers (SECURITY DEFINER, so they bypass profiles RLS and
-- work cross-tenant). Defined here (before SECTION 8) because follows_insert_own
-- references profile_is_active(). Expose only the MINIMAL identity the product
-- allows platform-wide (name/avatar/bio/socials); posts stay community-gated.
create or replace function public.profile_is_active(p_user uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = p_user and deleted_at is null);
$$;
grant execute on function public.profile_is_active(uuid) to authenticated;

create or replace function public.user_card(p_user uuid)
returns table (id uuid, display_name text, avatar_url text, bio text, social_links jsonb)
language sql security definer set search_path = public stable as $$
  select p.id, p.display_name, p.avatar_url, p.bio, p.social_links
  from public.profiles p
  where p.id = p_user and p.deleted_at is null;
$$;
grant execute on function public.user_card(uuid) to authenticated;

create or replace function public.get_followers(p_profile uuid)
returns table (user_id uuid, display_name text, avatar_url text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select f.follower_id, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.following_id = p_profile and p.deleted_at is null
  order by f.created_at desc;
$$;
grant execute on function public.get_followers(uuid) to authenticated;

create or replace function public.get_following(p_profile uuid)
returns table (user_id uuid, display_name text, avatar_url text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select f.following_id, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.following_id
  where f.follower_id = p_profile and p.deleted_at is null
  order by f.created_at desc;
$$;
grant execute on function public.get_following(uuid) to authenticated;


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
  using (profile_id = auth.uid() or is_teacher_admin(teacher_id) or (has_membership(teacher_id) and status = 'active'));

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

-- lesson_folders (0039) — member read gated by topic access (same as content_items);
-- admin-only writes.
create policy lesson_folders_select        on public.lesson_folders for select to authenticated using (has_membership(teacher_id) and can_access_topic(topic_id));
create policy lesson_folders_insert_admin  on public.lesson_folders for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy lesson_folders_update_admin  on public.lesson_folders for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy lesson_folders_delete_admin  on public.lesson_folders for delete to authenticated using (is_teacher_admin(teacher_id));

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
-- 0026: DELETE = author OR admin-of-this-teacher (moderation). UPDATE stays author-only.
create policy comments_delete_owner_or_admin on public.comments for delete to authenticated
  using (
    auth.uid() = author_id
    or is_teacher_admin((select p.teacher_id from public.posts p where p.id = comments.post_id))
  );

-- comment_images (0026) — read for members-context authenticated; write gated by owning the comment.
create policy comment_images_select on public.comment_images for select to authenticated using (true);
create policy comment_images_insert_own on public.comment_images for insert to authenticated
  with check (exists (select 1 from public.comments c where c.id = comment_images.comment_id and c.author_id = auth.uid()));
create policy comment_images_delete_own on public.comment_images for delete to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_images.comment_id and c.author_id = auth.uid()));

-- event_rsvps (0028) — read for members of the event's teacher; write own only.
create policy event_rsvps_select on public.event_rsvps for select to authenticated
  using (has_membership((select e.teacher_id from public.events e where e.id = event_rsvps.event_id)));
create policy event_rsvps_insert_own on public.event_rsvps for insert to authenticated
  with check (user_id = auth.uid() and has_membership((select e.teacher_id from public.events e where e.id = event_rsvps.event_id)));
create policy event_rsvps_delete_own on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

-- saved_posts (0029) — strictly own-only (a bookmark is private).
create policy saved_posts_select_own on public.saved_posts for select to authenticated
  using (user_id = auth.uid());
create policy saved_posts_insert_own on public.saved_posts for insert to authenticated
  with check (user_id = auth.uid());
create policy saved_posts_delete_own on public.saved_posts for delete to authenticated
  using (user_id = auth.uid());

-- post_reactions (0032) — read for members of the post's teacher; write own only.
create policy post_reactions_select on public.post_reactions for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_reactions.post_id)));
create policy post_reactions_insert_own on public.post_reactions for insert to authenticated
  with check (user_id = auth.uid() and has_membership((select p.teacher_id from public.posts p where p.id = post_reactions.post_id)));
create policy post_reactions_delete_own on public.post_reactions for delete to authenticated
  using (user_id = auth.uid());

-- channel_reads (0036) — strictly own-only.
create policy channel_reads_select_own on public.channel_reads for select to authenticated
  using (user_id = auth.uid());
create policy channel_reads_insert_own on public.channel_reads for insert to authenticated
  with check (user_id = auth.uid());
create policy channel_reads_update_own on public.channel_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy channel_reads_delete_own on public.channel_reads for delete to authenticated
  using (user_id = auth.uid());

-- polls (0033) — read for members of the post's teacher; only the post author creates.
create policy polls_select on public.polls for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = polls.post_id)));
create policy polls_insert_own on public.polls for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = polls.post_id and p.author_id = auth.uid()));

-- poll_options — read membership-gated via poll→post; insert only by the post author.
create policy poll_options_select on public.poll_options for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p
                         join public.polls pl on pl.post_id = p.id
                         where pl.id = poll_options.poll_id)));
create policy poll_options_insert_own on public.poll_options for insert to authenticated
  with check (exists (select 1 from public.polls pl
                      join public.posts p on p.id = pl.post_id
                      where pl.id = poll_options.poll_id and p.author_id = auth.uid()));

-- poll_votes — read membership-gated; write own only, and only while the poll is open.
create policy poll_votes_select on public.poll_votes for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p
                         join public.polls pl on pl.post_id = p.id
                         where pl.id = poll_votes.poll_id)));
create policy poll_votes_insert_own on public.poll_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_membership((select p.teacher_id from public.posts p
                        join public.polls pl on pl.post_id = p.id
                        where pl.id = poll_votes.poll_id))
    and exists (select 1 from public.polls pl
                where pl.id = poll_votes.poll_id
                and (pl.closes_at is null or pl.closes_at > now()))
  );
create policy poll_votes_delete_own on public.poll_votes for delete to authenticated
  using (user_id = auth.uid());

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

-- notifications (0013) — own rows only, keyed on recipient_id. There is deliberately
-- NO INSERT policy: rows come only from the SECTION 13 SECURITY DEFINER triggers, so a
-- client cannot forge one (0016 also REVOKEs the INSERT privilege). No has_membership()
-- term is needed — the triggers only ever address active, non-tombstoned members of the
-- row's teacher_id, so recipient_id = auth.uid() is already tenant-safe.
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- push_subscriptions (0014) — own rows only. Device-scoped, no teacher term.
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- follows (0024) — platform-wide graph. SELECT is open to any authenticated user
-- (counts/lists render for everyone). INSERT only as yourself, only a non-tombstoned
-- target, never self (the follows_no_self CHECK also guards self). DELETE only your
-- own follow (unfollow). No UPDATE policy — a follow has no mutable state.
create policy follows_select_all on public.follows for select to authenticated
  using (true);
-- 0025: gate the insert on existence/tombstone via the SECURITY DEFINER
-- profile_is_active() (below), NOT an inline profiles EXISTS — the inline form was
-- evaluated under profiles RLS (co-member only), which locked follows to shared
-- communities. The definer helper bypasses that, so you can follow ANY live user.
create policy follows_insert_own on public.follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
    and public.profile_is_active(following_id)
  );
create policy follows_delete_own on public.follows for delete to authenticated
  using (follower_id = auth.uid());

-- dm_threads / dm_messages (0034) — SELECT only for participants. No client INSERT/
-- UPDATE policies: writes go through the SECURITY DEFINER RPCs in SECTION 16.
create policy dm_threads_select on public.dm_threads for select to authenticated
  using (auth.uid() in (user_a, user_b));
create policy dm_messages_select on public.dm_messages for select to authenticated
  using (exists (select 1 from public.dm_threads t
                 where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)));


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

-- comment-images ({uid}/{comment_id}/{pos}.jpg) — public read; own-folder write
-- (gated on foldername[1] = uid, like avatars). 0026.
drop policy if exists comment_images_obj_select on storage.objects;
create policy comment_images_obj_select on storage.objects for select to authenticated using (bucket_id = 'comment-images');
drop policy if exists comment_images_obj_insert on storage.objects;
create policy comment_images_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comment-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists comment_images_obj_delete on storage.objects;
create policy comment_images_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comment-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- post-attachments ({teacher_id}/{uid}/...) — the bucket is PRIVATE (0020, flag in
-- seed.sql): a public bucket meant any attached PDF was fetchable by url with no login
-- and no membership, including on members-only posts and across tenants. Reads are now
-- short-lived SIGNED urls (lib/posts.ts, user client), so the SELECT policy below is
-- the enforcement point — it did not exist before, because a public bucket never
-- consulted RLS at all. SELECT is any active member of the owning teacher (shared
-- content); insert/delete stay restricted to the uploader via segment[2] = uid.
drop policy if exists post_attachments_obj_select on storage.objects;
create policy post_attachments_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'post-attachments' and has_membership(((storage.foldername(name))[1])::uuid));
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

-- content-files ({teacher_id}/...) — admin write, member read. The bucket is PRIVATE
-- (0019, set in seed.sql): the old public-read bucket meant any leaked url bypassed
-- membership AND tag gating forever. Reads are now short-lived SIGNED urls, and because
-- signing performs a SELECT under RLS, the policy below IS the enforcement point —
-- an active member of the OWNING teacher only. Tag gating stays in the app layer
-- (can_access_topic) since storage RLS can't join a path back to content_items.
-- Sign with the USER's client, never service-role, or this policy is bypassed.
drop policy if exists content_files_select on storage.objects;
create policy content_files_select on storage.objects for select to authenticated
  using (bucket_id = 'content-files' and has_membership(((storage.foldername(name))[1])::uuid));
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
--     memberships -> profiles cascade never fires). Same for notifications
--     (recipient side) and push_subscriptions — 0016.
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

  -- (1b) Un-publish the leaving user's posts (0011): drop them from the public
  --      feed at the source. Belt-and-suspenders — public_posts_feed also filters
  --      on the author's deleted_at is null.
  update public.posts set is_public = false where author_id = v_user_id;

  -- (2) Remove post media ROWS for this user's posts (files removed by caller).
  delete from public.post_images
   where post_id in (select id from public.posts where author_id = v_user_id);
  delete from public.post_attachments
   where post_id in (select id from public.posts where author_id = v_user_id);

  -- (3) Progress tables.
  delete from public.content_progress where user_id = v_user_id;
  delete from public.classroom_recording_progress where user_id = v_user_id;

  -- (3b) Notifications ADDRESSED TO this user (0013/0016). The FK to profiles is
  --      ON DELETE CASCADE, but the profile is TOMBSTONED not deleted, so the
  --      cascade never fires — delete explicitly, same reasoning as memberships
  --      in (4). Rows where the leaving user is the ACTOR are deliberately KEPT:
  --      the tombstoned profile still joins, so they render "[Deleted user] …",
  --      matching how their posts and comments behave.
  delete from public.notifications where recipient_id = v_user_id;

  -- (3c) Web-push endpoints (0014/0016). Same tombstone/cascade reasoning. This
  --      one is not merely hygiene: leaving the row behind means a deleted
  --      account's browser subscription stays live and the service-role send
  --      path would keep delivering OS-level pushes to it.
  delete from public.push_subscriptions where user_id = v_user_id;

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
-- SECTION 11 — member roles (promote/demote; set_membership_role)
-- =============================================================================
-- Also lives as the standalone hand-run migration 0007_membership_roles.sql; the
-- function + grant block below is BYTE-IDENTICAL to that file. memberships is
-- WRITE-LESS to authenticated (SECTION 7: no INSERT/UPDATE/DELETE grant; SECTION 8:
-- only a SELECT policy), so a role flip cannot go through plain RLS — this SECURITY
-- DEFINER RPC is the ONLY authenticated write path into memberships.role.
--   • Enforces the LAST-ADMIN INVARIANT transactionally: a teacher must never drop to
--     zero active admins. LOCK-then-COUNT the whole active-admin set (FOR UPDATE)
--     serializes concurrent demotions; count admins OTHER THAN the target, reject if 0.
--   • Guard order is AUTHZ-BEFORE-OBSERVATION: is_teacher_admin(caller) runs BEFORE any
--     target lookup, so error codes cannot existence-probe another teacher's members.
--   • Caller is auth.uid() — never a param. status='active' filters the lock, the
--     count, AND the final UPDATE (a revoked row is never counted or flipped).

create or replace function public.set_membership_role(
  p_teacher_id uuid,
  p_profile_id uuid,
  p_new_role   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller       uuid;
  v_current_role text;
  v_other_admins integer;
begin
  -- (1) Identify the caller from the JWT.
  v_caller := auth.uid();
  if v_caller is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- (2) AUTHZ FIRST — caller must be an active admin of THIS teacher. Runs BEFORE any
  --     target lookup so a non-admin cannot existence-probe members via error codes.
  if not public.is_teacher_admin(p_teacher_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  -- (3) Target must be an ACTIVE member of THIS teacher. Teacher-scoped lookup: a real
  --     teacher_id + a non-member / other-teacher / revoked profile_id => not_a_member.
  select role into v_current_role
  from public.memberships
  where profile_id = p_profile_id
    and teacher_id = p_teacher_id
    and status = 'active';
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_a_member');
  end if;

  -- (4) Validate the requested role (defense-in-depth atop the memberships CHECK).
  if p_new_role not in ('member', 'admin') then
    return jsonb_build_object('success', false, 'error', 'invalid_role');
  end if;

  -- (5) No-op short-circuit — the desired state already holds (idempotent, race-safe).
  if v_current_role = p_new_role then
    return jsonb_build_object('success', true, 'role', v_current_role, 'profile_id', p_profile_id);
  end if;

  -- (6) LAST-ADMIN GUARD (demotion only). LOCK-THEN-COUNT, two statements:
  --     (a) lock the teacher's ENTIRE active-admin set — this serializes concurrent
  --         demotions; locking only the target row would not.
  --     (b) count active admins OTHER THAN the target. Zero => this flip would empty
  --         the admin set => reject. Sole-admin self-demotion hits this same path.
  if v_current_role = 'admin' and p_new_role = 'member' then
    perform 1
    from public.memberships
    where teacher_id = p_teacher_id
      and role = 'admin'
      and status = 'active'
    for update;

    select count(*) into v_other_admins
    from public.memberships
    where teacher_id = p_teacher_id
      and role = 'admin'
      and status = 'active'
      and profile_id <> p_profile_id;

    if v_other_admins = 0 then
      return jsonb_build_object('success', false, 'error', 'last_admin');
    end if;
  end if;

  -- (7) Flip. status='active' in the WHERE so a revoked row is never mutated.
  update public.memberships
     set role = p_new_role
   where profile_id = p_profile_id
     and teacher_id = p_teacher_id
     and status = 'active';

  return jsonb_build_object('success', true, 'role', p_new_role, 'profile_id', p_profile_id);
end;
$$;

grant execute on function public.set_membership_role(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- request_membership — any logged-in user, self-only. Idempotent via
-- memberships_profile_teacher_key. Revoked re-applications flip to pending.
-- ---------------------------------------------------------------------
create or replace function public.request_membership(
  p_teacher_id uuid,
  p_source     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_status text;
begin
  if v_caller is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not exists (select 1 from public.teachers t where t.id = p_teacher_id) then
    return jsonb_build_object('success', false, 'error', 'unknown_teacher');
  end if;

  insert into public.memberships (profile_id, teacher_id, role, status, source)
  values (v_caller, p_teacher_id, 'member', 'pending', p_source)
  on conflict on constraint memberships_profile_teacher_key do nothing;

  select status into v_status
  from public.memberships
  where profile_id = v_caller and teacher_id = p_teacher_id
  for update;

  if v_status = 'revoked' then
    update public.memberships
      set status = 'pending', source = p_source
      where profile_id = v_caller and teacher_id = p_teacher_id;
    v_status := 'pending';
  end if;

  return jsonb_build_object('success', true, 'status', v_status);
end;
$$;

grant execute on function public.request_membership(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- set_membership_status — admin approve/deny. Mirrors set_membership_role.
-- authz-before-observation; only ever transitions OUT of pending.
-- ---------------------------------------------------------------------
create or replace function public.set_membership_status(
  p_teacher_id  uuid,
  p_profile_id  uuid,
  p_new_status  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_exists boolean;
begin
  if not public.is_teacher_admin(p_teacher_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if p_new_status not in ('active','revoked') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select exists (
    select 1 from public.memberships
    where profile_id = p_profile_id
      and teacher_id = p_teacher_id
      and status = 'pending'
    for update
  ) into v_exists;

  if not v_exists then
    return jsonb_build_object('success', false, 'error', 'not_pending');
  end if;

  update public.memberships
    set status = p_new_status
    where profile_id = p_profile_id
      and teacher_id = p_teacher_id
      and status = 'pending';

  return jsonb_build_object('success', true, 'status', p_new_status);
end;
$$;

grant execute on function public.set_membership_status(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- revoke_membership — admin revoke of an ACTIVE member (active -> revoked).
-- The mirror of set_membership_status's approve/deny (which only ever
-- transitions OUT of pending). Also lives as the standalone hand-run
-- migration 0009_membership_revoke.sql; the function + grant block below is
-- BYTE-IDENTICAL to that file. memberships is WRITE-LESS to authenticated, so
-- this SECURITY DEFINER RPC is the only write path into a revoke.
--   • Mirrors the set_membership_role guard EXACTLY: authz-before-observation
--     (is_teacher_admin before any target lookup) + the LAST-ADMIN INVARIANT
--     (LOCK-then-COUNT the whole active-admin set, reject at zero others),
--     applied to a status flip instead of a role flip.
--   • Two args, no status param: the destination is the fixed constant
--     'revoked'. Also DEMOTES to member in the same UPDATE (active/admin ->
--     revoked/member) so a re-approved former admin is never silently
--     restored as admin — re-joiners come back plain members needing an
--     explicit re-promotion.
-- ---------------------------------------------------------------------
create or replace function public.revoke_membership(
  p_teacher_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller       uuid;
  v_current_role text;
  v_other_admins integer;
begin
  -- (1) Identify the caller from the JWT.
  v_caller := auth.uid();
  if v_caller is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- (2) AUTHZ FIRST — caller must be an active admin of THIS teacher. Runs BEFORE any
  --     target lookup so a non-admin cannot existence-probe members via error codes.
  if not public.is_teacher_admin(p_teacher_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  -- (3) Target must be an ACTIVE member of THIS teacher. Teacher-scoped lookup: a real
  --     teacher_id + a non-member / other-teacher / already-revoked profile_id => not_a_member
  --     (re-revoking an already-revoked member falls here — benign no-op denial).
  select role into v_current_role
  from public.memberships
  where profile_id = p_profile_id
    and teacher_id = p_teacher_id
    and status = 'active';
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_a_member');
  end if;

  -- (4) LAST-ADMIN GUARD — fires whenever the TARGET is an active admin (revoking any admin
  --     removes them from the active-admin set). LOCK-THEN-COUNT, two statements (mirrors
  --     set_membership_role):
  --     (a) lock the teacher's ENTIRE active-admin set — this serializes concurrent revokes;
  --         locking only the target row would not.
  --     (b) count active admins OTHER THAN the target. Zero => this revoke would empty the
  --         admin set => reject. Sole-admin self-revoke hits this same path.
  if v_current_role = 'admin' then
    perform 1
    from public.memberships
    where teacher_id = p_teacher_id
      and role = 'admin'
      and status = 'active'
    for update;

    select count(*) into v_other_admins
    from public.memberships
    where teacher_id = p_teacher_id
      and role = 'admin'
      and status = 'active'
      and profile_id <> p_profile_id;

    if v_other_admins = 0 then
      return jsonb_build_object('success', false, 'error', 'last_admin');
    end if;
  end if;

  -- (5) Revoke AND demote in the same UPDATE (active/admin-or-member -> revoked/member).
  --     Resetting role prevents silent admin restoration: a revoked admin who re-requests via
  --     /join and is re-approved returns a plain member needing explicit re-promotion, never
  --     silently as admin. status='active' in the WHERE so a revoked row is never mutated.
  update public.memberships
     set status = 'revoked',
         role   = 'member'
   where profile_id = p_profile_id
     and teacher_id = p_teacher_id
     and status = 'active';

  return jsonb_build_object('success', true, 'status', 'revoked', 'profile_id', p_profile_id);
end;
$$;

grant execute on function public.revoke_membership(uuid, uuid) to authenticated;


-- =============================================================================
-- SECTION 12 — public posts (0011: opt-in public visibility)
-- =============================================================================
-- A post is publicly visible iff is_public AND NOT hidden_from_public AND the
-- author is NOT tombstoned. Flag writes go ONLY through these SECURITY DEFINER
-- RPCs (authenticated has no direct UPDATE on the flag columns — SECTION 7).
-- Each flag RPC checks authz from the post's teacher/author BEFORE acting and
-- collapses not-found into an opaque 'not_authorized' (no cross-tenant existence
-- oracle). public_posts_feed is the ONLY anon read path into public posts.

-- set_post_public — AUTHOR consent toggle (author AND active member).
create or replace function public.set_post_public(p_post_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_author  uuid;
  v_teacher uuid;
begin
  select author_id, teacher_id into v_author, v_teacher
    from public.posts where id = p_post_id;

  -- authz gate: not-found, not-author, and not-active-member are indistinguishable.
  if v_author is null
     or v_author <> auth.uid()
     or not public.has_membership(v_teacher) then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  update public.posts set is_public = p_value where id = p_post_id;
  return jsonb_build_object('success', true, 'is_public', p_value);
end;
$$;

-- set_post_hidden — ADMIN kill switch (is_teacher_admin of the post's teacher).
create or replace function public.set_post_hidden(p_post_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_teacher uuid;
begin
  select teacher_id into v_teacher
    from public.posts where id = p_post_id;

  if v_teacher is null or not public.is_teacher_admin(v_teacher) then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  update public.posts set hidden_from_public = p_value where id = p_post_id;
  return jsonb_build_object('success', true, 'hidden_from_public', p_value);
end;
$$;

-- set_post_featured — ADMIN prominence flag. p_value=true REJECTED ('not_public')
-- unless the post is CURRENTLY is_public AND NOT hidden_from_public. The not_public
-- branch is reachable only after authz passes, so it leaks nothing to a stranger.
create or replace function public.set_post_featured(p_post_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_teacher   uuid;
  v_is_public boolean;
  v_hidden    boolean;
begin
  select teacher_id, is_public, hidden_from_public
    into v_teacher, v_is_public, v_hidden
    from public.posts where id = p_post_id;

  if v_teacher is null or not public.is_teacher_admin(v_teacher) then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;

  if p_value and not (v_is_public and not v_hidden) then
    return jsonb_build_object('success', false, 'error', 'not_public');
  end if;

  update public.posts set featured = p_value where id = p_post_id;
  return jsonb_build_object('success', true, 'featured', p_value);
end;
$$;

-- set_post_pinned (0031) — ADMIN pins a post to the top of its channel. Admin-gated
-- by is_teacher_admin of the post's teacher (so the owner-or-admin UPDATE grant can't
-- be used by an author to self-pin). pinned_at doubles as flag + sort key.
create or replace function public.set_post_pinned(p_post_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_teacher uuid;
begin
  select teacher_id into v_teacher from public.posts where id = p_post_id;
  if v_teacher is null or not public.is_teacher_admin(v_teacher) then
    return jsonb_build_object('success', false, 'error', 'not_authorized');
  end if;
  update public.posts set pinned_at = case when p_value then now() else null end where id = p_post_id;
  return jsonb_build_object('success', true, 'pinned', p_value);
end;
$$;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;

-- public_posts_feed — the ONLY anon read path INTO posts. SECURITY DEFINER (bypasses
-- posts/profiles/post_likes RLS), but the hard WHERE + fixed return columns cap
-- exactly what leaves: NO post id / channel_id / comments. author_id IS returned
-- (0017) so a public feed card can link to /u/[teacher]/[id]; it's a random uuid,
-- not a login credential, and exposes nothing beyond "this public post's author."
-- p_teacher_id null => all teachers. p_author_id (0017) null => all authors; set =>
-- ONE author's public posts (the profile page reuses this SAME predicate, so
-- "what is a public post" is defined once). Order featured-first, then created_at
-- desc. limit defaults to 20 (NULL => 20, NOT 0 rows), hard ceiling 100.
-- (0017: signature gained p_author_id and the return gained author_id — this was a
-- DROP + CREATE, not a plain replace, since the RETURNS shape changed.)
-- (0018: returns image_url — post_images.url, an ABSOLUTE public URL — instead of
-- image_path. The client no longer rebuilds a URL with getPublicUrl, which wrongly
-- assumed every image's bytes live in THIS project's bucket; content imported from
-- the single-tenant projects keeps its original public URL and 404'd. Also a
-- DROP + CREATE. Security is unchanged: same rows, and the in-app card has always
-- rendered this exact URL.)
create or replace function public.public_posts_feed(
  p_limit        int,
  p_offset       int,
  p_teacher_id   uuid default null,
  p_author_id    uuid default null,
  p_category_slug text default null
)
returns table (
  post_id      uuid,
  author_id    uuid,
  display_name text,
  avatar_url   text,
  body         text,
  image_url    text,
  like_count   bigint,
  teacher_slug text,
  teacher_name text,
  featured     boolean,
  created_at   timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    p.id                                                    as post_id,
    p.author_id,
    pr.display_name,
    pr.avatar_url,
    p.body,
    (select pi.url
       from public.post_images pi
      where pi.post_id = p.id
      order by pi."position" asc
      limit 1)                                              as image_url,
    (select count(*)
       from public.post_likes pl
      where pl.post_id = p.id)                              as like_count,
    t.slug                                                  as teacher_slug,
    t.name                                                  as teacher_name,
    p.featured,
    p.created_at
  from public.posts p
  join public.profiles pr  on pr.id  = p.author_id
  join public.teachers t   on t.id   = p.teacher_id
  left join public.categories cat on cat.id = t.category_id
  where p.is_public
    and not p.hidden_from_public
    and pr.deleted_at is null
    and (p_teacher_id    is null or p.teacher_id = p_teacher_id)
    and (p_author_id     is null or p.author_id  = p_author_id)
    and (p_category_slug is null or cat.slug     = p_category_slug)
  order by p.featured desc, p.created_at desc
  limit  least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- public_member_header (0017) — the profile HEADER for one author in one teacher,
-- backing the public /u/[teacher]/[id] page. SECURITY DEFINER, anon-granted. Returns
-- a row ONLY for an ACTIVE, non-tombstoned member of that teacher (mirrors the
-- getMemberProfile gate); empty result => the page 404s. Exposes bio + social_links
-- publicly (product decision, 0017) — previously co-member-only. The author's PUBLIC
-- posts are fetched separately via public_posts_feed(p_author_id), never here.
create or replace function public.public_member_header(
  p_teacher_id uuid,
  p_author_id  uuid
)
returns table (
  display_name text,
  avatar_url   text,
  bio          text,
  social_links jsonb,
  role         text,
  teacher_slug text,
  teacher_name text
)
language sql stable security definer set search_path to 'public'
as $$
  select
    pr.display_name,
    pr.avatar_url,
    pr.bio,
    pr.social_links,
    m.role,
    t.slug as teacher_slug,
    t.name as teacher_name
  from public.memberships m
  join public.profiles pr on pr.id = m.profile_id
  join public.teachers  t on t.id  = m.teacher_id
  where m.teacher_id = p_teacher_id
    and m.profile_id = p_author_id
    and m.status = 'active'
    and pr.deleted_at is null
  limit 1;
$$;

grant execute on function public.set_post_public(uuid, boolean)   to authenticated;
grant execute on function public.set_post_hidden(uuid, boolean)   to authenticated;
grant execute on function public.set_post_featured(uuid, boolean) to authenticated;
-- public_post (0023) — single public post for the public /p/[id] detail page. Same
-- public gate as the feed (is_public AND NOT hidden AND author not tombstoned), so a
-- private post is unreachable even by id. Returns comment_count (a COUNT only — comment
-- TEXT never crosses this boundary; comments stay members-only), plus channel_slug so
-- /p/[id] can redirect a member to the real in-app post. SECURITY DEFINER, anon-granted.
create or replace function public.public_post(p_post_id uuid)
returns table (
  post_id       uuid,
  author_id     uuid,
  display_name  text,
  avatar_url    text,
  title         text,
  body          text,
  image_url     text,
  like_count    bigint,
  comment_count bigint,
  teacher_slug  text,
  teacher_name  text,
  channel_slug  text,
  featured      boolean,
  created_at    timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    p.id as post_id,
    p.author_id,
    pr.display_name,
    pr.avatar_url,
    p.title,
    p.body,
    (select pi.url from public.post_images pi
      where pi.post_id = p.id order by pi."position" asc limit 1)  as image_url,
    (select count(*) from public.post_likes pl where pl.post_id = p.id) as like_count,
    (select count(*) from public.comments c where c.post_id = p.id)     as comment_count,
    t.slug  as teacher_slug,
    t.name  as teacher_name,
    ch.slug as channel_slug,
    p.featured,
    p.created_at
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.teachers t  on t.id  = p.teacher_id
  left join public.channels ch on ch.id = p.channel_id
  where p.id = p_post_id
    and p.is_public
    and not p.hidden_from_public
    and pr.deleted_at is null
  limit 1;
$$;

grant execute on function public.public_posts_feed(int, int, uuid, uuid, text) to anon, authenticated;
grant execute on function public.public_member_header(uuid, uuid) to anon, authenticated;
grant execute on function public.public_post(uuid) to anon, authenticated;

-- public_feed_categories (0022) — categories that have >=1 public post, for the
-- homepage feed chips. SECURITY DEFINER + anon-granted, same reason as the feed: anon
-- can't SELECT posts under RLS.
create or replace function public.public_feed_categories()
returns table (slug text, name text)
language sql stable security definer set search_path to 'public'
as $$
  select distinct c.slug, c.name
  from public.posts p
  join public.teachers t   on t.id  = p.teacher_id
  join public.categories c on c.id  = t.category_id
  join public.profiles pr  on pr.id = p.author_id
  where p.is_public and not p.hidden_from_public and pr.deleted_at is null
  order by c.name;
$$;

grant execute on function public.public_feed_categories() to anon, authenticated;


-- =============================================================================
-- SECTION 13 — notifications machinery (0013: mentions, in-app; 0014: web push)
-- =============================================================================
-- The notifications and push_subscriptions TABLES are in SECTION 4 (notifications
-- FKs comments, a leaf); RLS enable in 6, grants in 7, policies in 8, account-deletion
-- cleanup in 10. What lives here is the write path: the SECURITY DEFINER helpers and
-- the AFTER INSERT triggers that are the ONLY producers of notification rows.
--
-- MENTIONS: the composer stores mentions inline in the post/comment body as tokens
-- `@[Display Name](<uuid>)`, and @all as `@[everyone](all)`. The triggers parse the
-- uuids out of the body — plain @-text a user types is NOT parsed, so a typo like
-- "@bob" pings nobody. @all is ADMIN-ONLY, enforced in-trigger by a memberships role
-- check; a non-admin whose body contains `](all)` simply generates no @all rows.
--
-- TENANCY: every recipient is resolved through an ACTIVE, non-tombstoned membership of
-- the post's teacher_id, so a notification never crosses a tenant boundary and
-- tombstoned users get none. This is why the SECTION 8 policies need no membership term.

-- (1) Helper — extract picker-token uuids from a body string.
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

-- (2) Helper — create mention + @all notifications for a body. Shared by the post and
--     comment triggers. Runs as owner (definer), bypassing the no-insert RLS.
create or replace function public._notify_mentions(
  p_teacher uuid,
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
  -- Individual @mentions — one row per mentioned, active, non-tombstoned member
  -- of this teacher (never the actor themselves).
  if array_length(v_ids, 1) is not null then
    insert into public.notifications
      (teacher_id, recipient_id, actor_id, type, post_id, comment_id)
    select p_teacher, mem.profile_id, p_actor, 'mention', p_post, p_comment
    from public.memberships mem
    join public.profiles pr on pr.id = mem.profile_id
    where mem.teacher_id = p_teacher
      and mem.status = 'active'
      and pr.deleted_at is null
      and mem.profile_id = any(v_ids)
      and mem.profile_id <> p_actor;
  end if;

  -- @all — ADMIN-ONLY. Skip anyone already covered by an individual mention.
  if p_body like '%](all)%' then
    select exists (
      select 1 from public.memberships
      where teacher_id = p_teacher
        and profile_id = p_actor
        and role = 'admin'
        and status = 'active'
    ) into v_is_admin;

    if v_is_admin then
      insert into public.notifications
        (teacher_id, recipient_id, actor_id, type, post_id, comment_id)
      select p_teacher, mem.profile_id, p_actor, 'mention_all', p_post, p_comment
      from public.memberships mem
      join public.profiles pr on pr.id = mem.profile_id
      where mem.teacher_id = p_teacher
        and mem.status = 'active'
        and pr.deleted_at is null
        and mem.profile_id <> p_actor
        and mem.profile_id <> all(v_ids);
    end if;
  end if;
end;
$$;

-- (3) Trigger — new post: parse mentions / @all in the body.
create or replace function public.notify_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notify_mentions(new.teacher_id, new.author_id, new.id, null, new.body);
  return new;
end;
$$;

drop trigger if exists notify_on_post_insert on public.posts;
create trigger notify_on_post_insert
  after insert on public.posts
  for each row execute function public.notify_on_post();

-- (4) Trigger — new comment: mentions/@all + notify the POST author.
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher     uuid;
  v_post_author uuid;
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

  return new;
end;
$$;

drop trigger if exists notify_on_comment_insert on public.comments;
create trigger notify_on_comment_insert
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- (5) Trigger — like on a post: notify the post author. Deduped on
--     (recipient, actor, post, type) so like/unlike/like churn doesn't re-notify.
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_author  uuid;
begin
  select p.teacher_id, p.author_id
    into v_teacher, v_author
  from public.posts p
  where p.id = new.post_id;

  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  if exists (
       select 1 from public.memberships mem
       join public.profiles pr on pr.id = mem.profile_id
       where mem.teacher_id = v_teacher
         and mem.profile_id = v_author
         and mem.status = 'active'
         and pr.deleted_at is null
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
      (teacher_id, recipient_id, actor_id, type, post_id)
    values (v_teacher, v_author, new.user_id, 'post_like', new.post_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_post_like_insert on public.post_likes;
create trigger notify_on_post_like_insert
  after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

-- (6) Trigger — like on a comment: notify the comment author.
create or replace function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher uuid;
  v_author  uuid;
  v_post    uuid;
begin
  select p.teacher_id, c.author_id, c.post_id
    into v_teacher, v_author, v_post
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = new.comment_id;

  if v_author is null or v_author = new.user_id then
    return new;
  end if;

  if exists (
       select 1 from public.memberships mem
       join public.profiles pr on pr.id = mem.profile_id
       where mem.teacher_id = v_teacher
         and mem.profile_id = v_author
         and mem.status = 'active'
         and pr.deleted_at is null
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
      (teacher_id, recipient_id, actor_id, type, post_id, comment_id)
    values (v_teacher, v_author, new.user_id, 'comment_like', v_post, new.comment_id);
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_comment_like_insert on public.comment_likes;
create trigger notify_on_comment_like_insert
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();

-- (7) Realtime — let a signed-in user get live pushes of their own rows.
--     Safe to run repeatedly; ignore "already member of publication".
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- 0035: dm_messages realtime so the open thread updates live (RLS still scopes each
-- subscriber to threads they participate in).
do $$
begin
  alter publication supabase_realtime add table public.dm_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;


-- =============================================================================
-- SECTION 14 — event reminders (0027: pg_cron notifies each event's active members
-- at ~24h / ~8h / ~1h before it starts; reuses the notifications → push webhook)
-- =============================================================================
create or replace function public.send_event_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare v_event record;
begin
  for v_event in
    select id, teacher_id from public.events
    where reminded_24h_at is null and starts_at > now() + interval '8 hours' and starts_at <= now() + interval '24 hours'
    for update skip locked
  loop
    insert into public.notifications (teacher_id, recipient_id, type, event_id)
    select v_event.teacher_id, m.profile_id, 'event_reminder', v_event.id
    from public.memberships m join public.profiles p on p.id = m.profile_id
    where m.teacher_id = v_event.teacher_id and m.status = 'active' and p.deleted_at is null;
    update public.events set reminded_24h_at = now() where id = v_event.id;
  end loop;
  for v_event in
    select id, teacher_id from public.events
    where reminded_8h_at is null and starts_at > now() + interval '1 hour' and starts_at <= now() + interval '8 hours'
    for update skip locked
  loop
    insert into public.notifications (teacher_id, recipient_id, type, event_id)
    select v_event.teacher_id, m.profile_id, 'event_reminder', v_event.id
    from public.memberships m join public.profiles p on p.id = m.profile_id
    where m.teacher_id = v_event.teacher_id and m.status = 'active' and p.deleted_at is null;
    update public.events set reminded_8h_at = now() where id = v_event.id;
  end loop;
  for v_event in
    select id, teacher_id from public.events
    where reminded_1h_at is null and starts_at > now() and starts_at <= now() + interval '1 hour'
    for update skip locked
  loop
    insert into public.notifications (teacher_id, recipient_id, type, event_id)
    select v_event.teacher_id, m.profile_id, 'event_reminder', v_event.id
    from public.memberships m join public.profiles p on p.id = m.profile_id
    where m.teacher_id = v_event.teacher_id and m.status = 'active' and p.deleted_at is null;
    update public.events set reminded_1h_at = now() where id = v_event.id;
  end loop;
end; $$;
grant execute on function public.send_event_reminders() to service_role;

create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'event-reminders') then
    perform cron.unschedule('event-reminders');
  end if;
  perform cron.schedule('event-reminders', '*/10 * * * *', $cron$select public.send_event_reminders()$cron$);
end $$;


-- =============================================================================
-- SECTION 15 — invite join tokens (0030)
-- =============================================================================
-- teacher_by_join_token: resolve a community from an opaque invite token (join page).
create or replace function public.teacher_by_join_token(p_token text)
returns table (id uuid, slug text, name text, logo_url text, description text)
language sql security definer set search_path = public stable as $$
  select t.id, t.slug, t.name, t.logo_url, t.description
  from public.join_tokens jt join public.teachers t on t.id = jt.teacher_id
  where jt.token = p_token;
$$;
grant execute on function public.teacher_by_join_token(text) to anon, authenticated;

-- join_token_matches: gate requestToJoin — TRUE only if the token matches the teacher.
create or replace function public.join_token_matches(p_teacher_id uuid, p_token text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.join_tokens where teacher_id = p_teacher_id and token = p_token);
$$;
grant execute on function public.join_token_matches(uuid, text) to authenticated;

-- Every new teacher auto-gets a token.
create or replace function public.create_join_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.join_tokens (teacher_id) values (new.id) on conflict (teacher_id) do nothing;
  return new;
end $$;
drop trigger if exists teachers_create_join_token on public.teachers;
create trigger teachers_create_join_token after insert on public.teachers
  for each row execute function public.create_join_token();


-- =============================================================================
-- SECTION 16 — direct messages RPCs (0034; all SECURITY DEFINER, own-scoped)
-- =============================================================================
-- All DM writes flow through these; the tables grant SELECT only. Each enforces
-- its own authz (co-membership for thread creation, participant for send/read).

-- Open or create the caller↔p_other thread within teacher p_teacher (co-members only).
create or replace function public.get_or_create_dm_thread(p_other uuid, p_teacher uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_a uuid; v_b uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_other = auth.uid() then raise exception 'cannot_dm_self'; end if;
  if not exists (select 1 from public.memberships m
                 where m.profile_id = auth.uid() and m.teacher_id = p_teacher and m.status = 'active')
     or not exists (select 1 from public.memberships m
                    where m.profile_id = p_other and m.teacher_id = p_teacher and m.status = 'active')
  then raise exception 'not_comembers'; end if;
  if auth.uid() < p_other then v_a := auth.uid(); v_b := p_other;
  else v_a := p_other; v_b := auth.uid(); end if;
  insert into public.dm_threads (teacher_id, user_a, user_b) values (p_teacher, v_a, v_b)
  on conflict (teacher_id, user_a, user_b) do update set teacher_id = excluded.teacher_id
  returning id into v_id;
  return v_id;
end;
$$;

-- Send a message in a thread the caller participates in; bumps last_message_at.
create or replace function public.send_dm(p_thread uuid, p_body text)
returns public.dm_messages language plpgsql security definer set search_path to 'public'
as $$
declare v_msg public.dm_messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.dm_threads t
                 where t.id = p_thread and auth.uid() in (t.user_a, t.user_b)) then
    raise exception 'not_participant';
  end if;
  if char_length(coalesce(trim(p_body), '')) = 0 then raise exception 'empty_body'; end if;
  insert into public.dm_messages (thread_id, sender_id, body)
  values (p_thread, auth.uid(), trim(p_body)) returning * into v_msg;
  update public.dm_threads set last_message_at = now() where id = p_thread;
  -- 0035: notify the OTHER participant (bell + realtime + web push via the webhook).
  insert into public.notifications (teacher_id, recipient_id, actor_id, type, thread_id)
  select t.teacher_id,
         case when t.user_a = auth.uid() then t.user_b else t.user_a end,
         auth.uid(), 'direct_message', t.id
  from public.dm_threads t
  where t.id = p_thread;
  return v_msg;
end;
$$;

-- Mark a thread read up to now for the calling participant.
create or replace function public.mark_dm_read(p_thread uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.dm_threads set user_a_last_read_at = now() where id = p_thread and user_a = auth.uid();
  update public.dm_threads set user_b_last_read_at = now() where id = p_thread and user_b = auth.uid();
end;
$$;

-- Total unread DM messages for the caller within one teacher (nav badge).
create or replace function public.dm_unread_count(p_teacher uuid)
returns integer language sql stable security definer set search_path to 'public'
as $$
  select count(*)::int
  from public.dm_messages msg
  join public.dm_threads t on t.id = msg.thread_id
  where t.teacher_id = p_teacher
    and auth.uid() in (t.user_a, t.user_b)
    and msg.sender_id <> auth.uid()
    and msg.created_at > coalesce(
      case when t.user_a = auth.uid() then t.user_a_last_read_at else t.user_b_last_read_at end,
      '-infinity'::timestamptz);
$$;

grant execute on function public.get_or_create_dm_thread(uuid, uuid) to authenticated;
grant execute on function public.send_dm(uuid, text)                 to authenticated;
grant execute on function public.mark_dm_read(uuid)                  to authenticated;
grant execute on function public.dm_unread_count(uuid)               to authenticated;


-- =============================================================================
-- End of multitenant/schema.sql. Run multitenant/seed.sql next.
-- =============================================================================
