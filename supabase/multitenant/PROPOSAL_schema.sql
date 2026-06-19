-- =============================================================================
-- PROPOSAL — Multi-Tenant Phase 1 foundation schema  (REVIEW ONLY — DO NOT RUN)
-- =============================================================================
-- This is a reviewable proposal for the FRESH multi-tenant build. It has NOT
-- been run against any database (not even a scratch one). It implements the
-- locked decision record (D1–D8) for a brand-new project — NOT a migration of
-- the existing single-tenant prod.
--
-- THREE REINFORCEMENTS carried in explicitly (see inline [R1]/[R2]/[R3] tags):
--   [R1] Spine→spine consistency uses composite FK (id, teacher_id) wherever it
--        can be expressed (fails CLOSED). A trigger is used ONLY where a composite
--        FK genuinely cannot express the rule. Each relationship is annotated with
--        the mechanism chosen and why.
--   [R2] has_membership(NULL) returns FALSE explicitly (never errors). The leaf
--        SELECT policies depend on a missing/invisible parent → NULL teacher_id →
--        deny. A test asserts this in PROPOSAL_test_matrix.sql.
--   [R3] profiles has NO privilege-bearing column left to escalate into. is_admin
--        moves entirely to memberships.role (authenticated cannot write memberships).
--        A column-level GRANT is the PRIMARY defense; the self-update WITH CHECK is
--        belt-and-suspenders. Any sensitive column remaining on profiles is flagged.
--
-- CREATION ORDER (dependency-correct; runs start-to-finish on a fresh project):
--   0 base tables with NO outgoing FKs (teachers, profiles)
--   1 memberships (FK → profiles, teachers)
--   2 helper functions (bodies reference memberships)
--   3 spine tables   4 leaf tables   5 trigger
--   6 enable RLS     7 grants        8 policies (call the helpers)   9 storage
-- Every table is defined AFTER all tables it references. Helpers precede every
-- policy that calls them. RLS-enable and policies come after all tables exist.
--
-- Run order on a fresh project (once reviewed & approved): this file, then a
-- seed file (not included here). delete_my_account() is intentionally NOT carried
-- over verbatim — it references the now-removed is_admin and teacher-scoped storage
-- paths; see the flagged section at the end.
-- =============================================================================

set check_function_bodies = false;


-- =============================================================================
-- SECTION 0 — Base tables with NO outgoing FKs (must precede memberships)
-- =============================================================================

-- The tenant.
create table public.teachers (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    name        text not null,
    created_at  timestamptz default now()
    -- Brand/domain/timezone config columns are deferred to the parameterization
    -- pass (NOT Phase 1).
);

-- Shared identity: profiles.
-- [D1/A1] profiles.id is the single global identity, == auth.uid() for live users,
-- but has NO hard FK to auth.users (preserve the 0007 decoupling so a tombstoned
-- profile survives auth.users deletion and posts render "[Deleted user]").
--
-- [R3] is_admin is GONE from profiles. The only role/privilege now lives on
-- memberships.role, which authenticated cannot write (no INSERT/UPDATE/DELETE
-- policy below). Remaining profiles columns and their sensitivity:
--   id          — identity, NOT self-updatable (not in the column GRANT)
--   display_name, bio, avatar_url, social_links — user-editable (in the GRANT)
--   created_at  — NOT self-updatable
--   deleted_at  — TOMBSTONE marker. *** FLAG: privilege-adjacent ***. It must be
--                 settable ONLY by the SECURITY DEFINER deletion function, never by
--                 a self-update (a user faking deleted_at could hide themselves).
--                 It is therefore EXCLUDED from the column GRANT below.
-- Created here (before memberships) because memberships.profile_id FKs into it.
create table public.profiles (
    id            uuid primary key,           -- == auth.uid(); no FK to auth.users [A1]
    display_name  text not null,
    bio           text,
    avatar_url    text,
    created_at    timestamptz default now(),
    deleted_at    timestamptz,                -- set ONLY by the deletion function
    social_links  jsonb not null default '{}'::jsonb
);
create index profiles_deleted_at_idx on public.profiles (deleted_at) where (deleted_at is not null);


-- =============================================================================
-- SECTION 1 — Tenancy join: memberships (FK → profiles, teachers)
-- =============================================================================

-- The profile↔teacher join. [D2] role ∈ {member,admin}, status ∈ {active,revoked}.
-- No 'pending' (rows exist only when an admin grants), no 'owner' (additive later).
create table public.memberships (
    id          uuid primary key default gen_random_uuid(),
    profile_id  uuid not null references public.profiles(id) on delete cascade,
    teacher_id  uuid not null references public.teachers(id) on delete cascade,
    role        text not null default 'member' check (role in ('member','admin')),
    status      text not null default 'active' check (status in ('active','revoked')),
    created_at  timestamptz default now(),
    constraint memberships_profile_teacher_key unique (profile_id, teacher_id)
);
-- Drives has_membership(): keep the active-lookup a covered index hit.
create index memberships_lookup_idx on public.memberships (profile_id, teacher_id, status);
create index memberships_teacher_idx on public.memberships (teacher_id);


-- =============================================================================
-- SECTION 2 — Authz helper functions  ([R2] NULL handling is intentional)
-- =============================================================================
-- Defined AFTER memberships (their bodies query it) and BEFORE any policy (Section 8
-- calls them). check_function_bodies=false also makes creation order tolerant, but
-- the placement is kept honest.

-- TRUE iff auth.uid() has an ACTIVE membership for p_teacher_id.
-- [R2] p_teacher_id IS NULL → FALSE (never errors). Leaf SELECT policies feed this
-- a scalar subquery that yields NULL when the parent row is missing/invisible; that
-- NULL MUST deny, not raise.
create or replace function public.has_membership(p_teacher_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_teacher_id is null then false                       -- [R2] explicit
    else exists (
      select 1
      from public.memberships m
      where m.profile_id = auth.uid()
        and m.teacher_id = p_teacher_id
        and m.status = 'active'
    )
  end;
$$;

-- TRUE iff auth.uid() is an ACTIVE admin of p_teacher_id. (Implies has_membership.)
-- [R2] same NULL contract.
create or replace function public.is_teacher_admin(p_teacher_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_teacher_id is null then false                       -- [R2] explicit
    else exists (
      select 1
      from public.memberships m
      where m.profile_id = auth.uid()
        and m.teacher_id = p_teacher_id
        and m.status = 'active'
        and m.role = 'admin'
    )
  end;
$$;


-- =============================================================================
-- SECTION 3 — Spine tables (carry teacher_id directly) [D3]
-- =============================================================================
-- Each spine table:
--   • teacher_id uuid NOT NULL → teachers(id)
--   • UNIQUE (id, teacher_id) IF it is a composite-FK target [R1]
-- Spine→spine references use composite FK (child cols, teacher_id) → parent(id, teacher_id)
-- so child.teacher_id == parent.teacher_id is guaranteed by the FK (fails closed).
-- Intra-spine order: week_groups → channels → posts; topics → content_items;
-- classroom_folders → classroom_recordings. Every table here precedes any table
-- that references it.

-- ----- week_groups (a "month") -----------------------------------------------
create table public.week_groups (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null references public.teachers(id),
    name        text not null,
    "position"  integer not null default 0,
    created_at  timestamptz default now(),
    constraint week_groups_pkey primary key (id),
    constraint week_groups_id_teacher_key unique (id, teacher_id)   -- [R1] FK target
);
create index week_groups_position_idx on public.week_groups (teacher_id, "position" desc);

-- ----- channels (a Community channel OR a weekly "week") ----------------------
create table public.channels (
    id              uuid not null default gen_random_uuid(),
    teacher_id      uuid not null references public.teachers(id),
    slug            text not null,
    name            text not null,
    description     text,
    "position"      integer not null default 0,
    post_permission text not null default 'all' check (post_permission in ('all','admin_only')),
    section         text not null default 'community' check (section in ('community','weekly')),
    week_number     integer,
    group_id        uuid,
    created_at      timestamptz default now(),
    constraint channels_pkey primary key (id),
    constraint channels_id_teacher_key unique (id, teacher_id),     -- [R1] FK target (posts→channels)
    constraint channels_teacher_slug_key unique (teacher_id, slug), -- [D] slug unique PER TEACHER, not global
    constraint channels_weekly_has_group check ((section <> 'weekly') or (group_id is not null)),
    -- [R1] COMPOSITE FK: a weekly channel's month must be the SAME teacher.
    -- group_id is NULL for community channels → MATCH SIMPLE leaves the FK
    -- unenforced for those rows (correct). Mechanism: composite FK (fails closed).
    constraint channels_group_same_teacher_fkey
      foreign key (group_id, teacher_id) references public.week_groups (id, teacher_id)
);
create index channels_position_idx on public.channels (teacher_id, "position");
create index channels_section_group_week_idx on public.channels (teacher_id, section, group_id, week_number desc);

-- ----- posts ------------------------------------------------------------------
create table public.posts (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null references public.teachers(id),
    author_id   uuid not null references public.profiles(id) on delete cascade,  -- [D6] profiles
    title       text,
    body        text not null,
    channel_id  uuid,
    edited_at   timestamptz,
    created_at  timestamptz default now(),
    constraint posts_pkey primary key (id),
    -- [R1] COMPOSITE FK: a post's channel must be the SAME teacher. channel_id is
    -- nullable (null = unassigned) → MATCH SIMPLE leaves it unenforced for those
    -- rows (an admin-only case, also gated in the INSERT policy). Mechanism:
    -- composite FK (fails closed) — chosen over a trigger.
    constraint posts_channel_same_teacher_fkey
      foreign key (channel_id, teacher_id) references public.channels (id, teacher_id)
);
create index posts_created_at_idx on public.posts (teacher_id, created_at desc);
create index posts_channel_id_idx on public.posts (channel_id);
create index posts_author_id_idx on public.posts (author_id);

-- ----- topics -----------------------------------------------------------------
create table public.topics (
    id                 uuid not null default gen_random_uuid(),
    teacher_id         uuid not null references public.teachers(id),
    name               text not null,
    description        text,
    cover_image_url    text,
    cover_storage_path text,
    "position"         smallint not null default 0,
    is_locked          boolean not null default false,
    is_recordings      boolean not null default false,   -- [D5] replaces the magic UUID
    created_at         timestamptz default now(),
    constraint topics_pkey primary key (id),
    constraint topics_id_teacher_key unique (id, teacher_id)        -- [R1] FK target (content_items→topics)
);
create index topics_position_idx on public.topics (teacher_id, "position");
-- [D5] exactly ONE recordings topic per teacher — partial unique index.
create unique index topics_one_recordings_per_teacher_idx
  on public.topics (teacher_id) where (is_recordings);

-- ----- content_items ----------------------------------------------------------
create table public.content_items (
    id                     uuid not null default gen_random_uuid(),
    teacher_id             uuid not null references public.teachers(id),
    topic_id               uuid not null,
    type                   text not null check (type in ('video','document')),
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
    constraint content_items_payload_check check (
      ((type = 'video') and (video_url is not null)) or
      ((type = 'document') and (document_url is not null))
    ),
    -- [R1] COMPOSITE FK: a content item's topic must be the SAME teacher. topic_id
    -- is NOT NULL so this is always enforced. Mechanism: composite FK (fails closed).
    constraint content_items_topic_same_teacher_fkey
      foreign key (topic_id, teacher_id) references public.topics (id, teacher_id) on delete cascade
);
create index content_items_topic_id_idx on public.content_items (topic_id);

-- ----- classroom_folders (self-referential tree) ------------------------------
create table public.classroom_folders (
    id               uuid not null default gen_random_uuid(),
    teacher_id       uuid not null references public.teachers(id),
    name             text not null,
    parent_folder_id uuid,
    "position"       integer not null default 0,
    created_by       uuid references public.profiles(id) on delete set null,  -- [D6] profiles
    created_at       timestamptz default now(),
    constraint classroom_folders_pkey primary key (id),
    constraint classroom_folders_id_teacher_key unique (id, teacher_id),  -- [R1] FK target (self + recordings)
    -- [R1] SELF-REFERENTIAL COMPOSITE FK: a child folder's parent must be the SAME
    -- teacher. parent_folder_id is NULL for roots → MATCH SIMPLE unenforced (correct).
    -- *** Insert-ordering verification ***: a non-null parent must already exist at
    -- check time. For single-row inserts (the app's path) the parent pre-exists →
    -- fine. For multi-row tree seeds in ONE statement, per-row checking is
    -- order-sensitive, so the constraint is DEFERRABLE INITIALLY DEFERRED: the
    -- teacher-consistency + existence check is enforced at COMMIT (still fails
    -- closed), which lets a tree be seeded in any row order within a txn.
    -- Mechanism: composite FK (deferrable) — chosen over a trigger.
    constraint classroom_folders_parent_same_teacher_fkey
      foreign key (parent_folder_id, teacher_id)
      references public.classroom_folders (id, teacher_id)
      on delete cascade
      deferrable initially deferred
);
create index classroom_folders_parent_folder_id_idx on public.classroom_folders (parent_folder_id);

-- ----- classroom_recordings ---------------------------------------------------
create table public.classroom_recordings (
    id                      uuid not null default gen_random_uuid(),
    teacher_id              uuid not null references public.teachers(id),
    folder_id               uuid,
    title                   text not null,
    description             text,
    "position"              integer not null default 0,
    video_provider          text,
    video_id                text,          -- Bunny id; see [D7] note at end
    video_status            text default 'pending',
    video_duration_seconds  integer,
    video_thumbnail_url     text,
    created_by              uuid references public.profiles(id) on delete set null,  -- [D6] profiles
    created_at              timestamptz default now(),
    constraint classroom_recordings_pkey primary key (id),
    -- [R1] COMPOSITE FK: a recording's folder must be the SAME teacher. folder_id
    -- nullable → MATCH SIMPLE unenforced for top-level recordings (correct).
    -- Mechanism: composite FK (fails closed).
    constraint classroom_recordings_folder_same_teacher_fkey
      foreign key (folder_id, teacher_id)
      references public.classroom_folders (id, teacher_id) on delete cascade
);
create index classroom_recordings_folder_id_idx on public.classroom_recordings (folder_id);
create index classroom_recordings_video_id_idx on public.classroom_recordings (video_id);

-- ----- events -----------------------------------------------------------------
create table public.events (
    id          uuid not null default gen_random_uuid(),
    teacher_id  uuid not null references public.teachers(id),
    title       text not null,
    description text,
    starts_at   timestamptz not null,
    ends_at     timestamptz not null,
    location    text,
    meeting_url text,
    series_id   uuid,                       -- self-grouping, no FK (materialized days)
    created_by  uuid references public.profiles(id) on delete set null,  -- [D6/A4] profiles
    created_at  timestamptz default now(),
    constraint events_pkey primary key (id)
);
create index events_starts_at_idx on public.events (teacher_id, starts_at);
create index events_series_id_idx on public.events (series_id);
-- [A4] events now FKs into profiles via created_by. No code embeds profiles on
-- events today, so no PostgREST ambiguity now — but any future author:profiles
-- embed on events MUST use an explicit FK hint.


-- =============================================================================
-- SECTION 4 — Leaf tables (NO teacher_id; RLS joins to the parent) [D3]
-- =============================================================================
-- Leaves keep ONLY their existing parent FK (CASCADE). Teacher scope is resolved
-- in the RLS policy via a single PK lookup into the parent that carries teacher_id.
-- [A2] comment_likes is the lone 2-HOP leaf: comment_likes → comments → posts.
-- comments is defined before comment_likes; every leaf's parent (posts /
-- content_items / classroom_recordings, all in Section 3) already exists.

create table public.comments (
    id         uuid not null default gen_random_uuid(),
    post_id    uuid not null references public.posts(id) on delete cascade,
    author_id  uuid not null references public.profiles(id) on delete cascade,  -- [D6]
    body       text not null,
    created_at timestamptz default now(),
    constraint comments_pkey primary key (id)
);
create index comments_post_id_idx on public.comments (post_id);

create table public.post_images (
    id           uuid not null default gen_random_uuid(),
    post_id      uuid not null references public.posts(id) on delete cascade,
    url          text not null,
    storage_path text not null,
    "position"   smallint not null default 0,
    created_at   timestamptz default now(),
    constraint post_images_pkey primary key (id)
);
create index post_images_post_id_idx on public.post_images (post_id);

create table public.post_attachments (
    id           uuid not null default gen_random_uuid(),
    post_id      uuid not null references public.posts(id) on delete cascade,
    url          text not null,
    storage_path text not null,
    file_name    text not null,
    file_size    bigint not null,
    "position"   integer not null default 0,
    created_at   timestamptz default now(),
    constraint post_attachments_pkey primary key (id)
);
create index post_attachments_post_id_idx on public.post_attachments (post_id);

create table public.post_videos (
    id                     uuid not null default gen_random_uuid(),
    post_id                uuid not null references public.posts(id) on delete cascade,
    video_provider         text,
    video_id               text,           -- Bunny id; see [D7] note at end
    video_status           text default 'pending',
    video_duration_seconds integer,
    video_thumbnail_url    text,
    created_at             timestamptz default now(),
    constraint post_videos_pkey primary key (id),
    constraint post_videos_post_id_key unique (post_id)
);
create index post_videos_post_id_idx on public.post_videos (post_id);
create index post_videos_video_id_idx on public.post_videos (video_id);

create table public.post_likes (
    post_id    uuid not null references public.posts(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,  -- [D6]
    created_at timestamptz not null default now(),
    constraint post_likes_pkey primary key (post_id, user_id)
);
create index post_likes_post_id_idx on public.post_likes (post_id);
create index post_likes_user_id_idx on public.post_likes (user_id);

create table public.comment_likes (
    comment_id uuid not null references public.comments(id) on delete cascade,
    user_id    uuid not null references public.profiles(id) on delete cascade,  -- [D6]
    created_at timestamptz not null default now(),
    constraint comment_likes_pkey primary key (comment_id, user_id)
);
create index comment_likes_comment_id_idx on public.comment_likes (comment_id);
create index comment_likes_user_id_idx on public.comment_likes (user_id);

create table public.content_progress (
    user_id         uuid not null references public.profiles(id) on delete cascade,  -- [D6]
    content_item_id uuid not null references public.content_items(id) on delete cascade,
    completed_at    timestamptz not null default now(),
    constraint content_progress_pkey primary key (user_id, content_item_id)
);
create index content_progress_user_id_idx on public.content_progress (user_id);

create table public.classroom_recording_progress (
    user_id      uuid not null references public.profiles(id) on delete cascade,  -- [D6] now profiles (was auth.users)
    recording_id uuid not null references public.classroom_recordings(id) on delete cascade,
    completed_at timestamptz not null default now(),
    constraint classroom_recording_progress_pkey primary key (user_id, recording_id)
);
create index classroom_recording_progress_user_id_idx on public.classroom_recording_progress (user_id);
create index classroom_recording_progress_recording_id_idx on public.classroom_recording_progress (recording_id);


-- =============================================================================
-- SECTION 5 — handle_new_user trigger  [D8] PROFILE-ONLY, never a membership
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- [D8] Create the global profile row ONLY. NEVER insert a membership here —
  -- membership is admin-granted, out of band. Signup must not auto-enroll anyone.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- SECTION 6 — Enable RLS  (after all tables exist)
-- =============================================================================
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
alter table public.comments                         enable row level security;
alter table public.post_images                      enable row level security;
alter table public.post_attachments                 enable row level security;
alter table public.post_videos                      enable row level security;
alter table public.post_likes                       enable row level security;
alter table public.comment_likes                    enable row level security;
alter table public.content_progress                 enable row level security;
alter table public.classroom_recording_progress     enable row level security;


-- =============================================================================
-- SECTION 7 — Grants  (LEAST PRIVILEGE: authenticated gets ONLY the verbs its
-- policies exercise; anon gets NOTHING; [R3] profiles UPDATE is column-restricted)
-- =============================================================================
-- A fresh project can ship without the default privileges PostgREST relies on, so we
-- grant them explicitly. RLS remains the gate, but table grants are kept minimal so a
-- future permissive policy cannot silently WAKE a dormant, over-broad privilege.
--
-- [Item 1] anon: NO grants anywhere. Every policy in this schema is TO authenticated,
-- so a pre-login read/write is never intended in Phase 1. We also strip any default
-- table grants a fresh Supabase project may ship with. If a public pre-login surface
-- is added later (e.g. teacher branding), grant anon SELECT on THAT object then.
revoke all on all tables in schema public from anon;

-- service_role keeps full CRUD on everything (it bypasses RLS by design).
grant select, insert, update, delete on
  public.teachers, public.memberships, public.week_groups, public.channels,
  public.posts, public.topics, public.content_items, public.classroom_folders,
  public.classroom_recordings, public.events, public.comments, public.post_images,
  public.post_attachments, public.post_videos, public.post_likes, public.comment_likes,
  public.content_progress, public.classroom_recording_progress, public.profiles
  to service_role;

-- [Item 1] authenticated — FULL CRUD tables (admin- or owner-policies exist per verb):
grant select, insert, update, delete on
  public.week_groups, public.channels, public.posts, public.topics,
  public.content_items, public.classroom_folders, public.classroom_recordings,
  public.events, public.comments, public.post_videos
  to authenticated;

-- [Item 1] authenticated — SELECT/INSERT/DELETE only (no UPDATE policy exists here):
grant select, insert, delete on
  public.post_images, public.post_attachments, public.post_likes,
  public.comment_likes, public.content_progress, public.classroom_recording_progress
  to authenticated;

-- [Item 1] authenticated — SELECT only (read-only tables for the client):
grant select on public.teachers, public.memberships to authenticated;

-- [Item 2] memberships is the most sensitive table — default-deny by RLS today (G1/G2
-- prove it), but explicitly REVOKE writes so a future permissive policy cannot
-- silently activate a dormant table privilege. Defense-in-depth, not policy-dependent.
revoke insert, update, delete on public.memberships from authenticated, anon;

-- [R3] profiles: SELECT for authenticated; UPDATE restricted to NON-privilege columns
-- at the COLUMN-GRANT level (the PRIMARY guard — is_admin no longer exists, and
-- deleted_at / id / created_at stay non-self-updatable). RLS WITH CHECK is belt-and-
-- suspenders. INSERT happens via the SECURITY DEFINER trigger (service_role only).
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated, anon;
grant update (display_name, bio, avatar_url, social_links) on public.profiles to authenticated;


-- =============================================================================
-- SECTION 8 — RLS policies (public schema)  (helpers from Section 2 are defined)
-- =============================================================================

-- ----- teachers ---------------------------------------------------------------
-- You can see a teacher you belong to. (Public branding before login is an app
-- concern via a separate public view — deferred, NOT Phase 1.) No client writes.
create policy teachers_select_member on public.teachers
  for select to authenticated using (has_membership(id));

-- ----- memberships ------------------------------------------------------------
-- [R3] authenticated CANNOT write memberships (no insert/update/delete policy →
-- default deny). Grants are revoked-by-omission via RLS; service role / admin
-- tooling grants memberships out of band (the grant UX is Phase 2).
--
-- SELECT visibility (the has_membership branch is REQUIRED — see below):
--   • profile_id = auth.uid()      — always see your own membership rows.
--   • has_membership(teacher_id)    — an active member sees ALL membership rows of
--     teachers they belong to. This is what lets the profiles co-member policy's
--     `memberships m1 JOIN m2` read co-members' rows; without it that join sees only
--     the viewer's own row and the member directory collapses to self-only (caught by
--     test H1). is_teacher_admin's rows are a subset of this, kept as an explicit
--     branch for readability.
--
-- *** INTENTIONAL VISIBILITY WIDENING ***: an active member can now read co-members'
-- membership rows — including role and status — for teachers they share. That is the
-- desired member-directory behavior, but it IS a conscious widening (members learn who
-- the admins are, and who is revoked, within their own teacher). Flagged so it is a
-- decision, not an accident. It does NOT cross tenants: has_membership(teacher_id) is
-- false for any teacher the viewer is not an active member of.
--
-- *** NO RLS RECURSION ***: this policy calls has_membership(), which itself queries
-- public.memberships. That does NOT re-trigger this policy because has_membership is
-- SECURITY DEFINER and runs as its owner (the schema/table owner), whose query bypasses
-- RLS on memberships (no FORCE ROW LEVEL SECURITY is set). The definer-bypass is the
-- reason this is safe — the same property the leaf SELECT policies already rely on.
create policy memberships_select_self_or_comember on public.memberships
  for select to authenticated
  using (
    profile_id = auth.uid()
    or is_teacher_admin(teacher_id)
    or has_membership(teacher_id)
  );

-- ----- profiles ---------------------------------------------------------------
-- Cross-tenant scoping (replaces the audit's USING(true) leak): you see yourself,
-- plus profiles of anyone who shares a teacher with you. NOTE the asymmetry — the
-- VIEWER (m1) must be active, but the TARGET (m2) need NOT be active, so a
-- tombstoned / revoked author still resolves for "[Deleted user]" rendering on
-- posts you can see.
create policy profiles_select_self_or_comember on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m2.teacher_id = m1.teacher_id
      where m1.profile_id = auth.uid() and m1.status = 'active'
        and m2.profile_id = profiles.id            -- target need NOT be active
    )
  );
-- [R3] Belt-and-suspenders ONLY (the column GRANT in Section 7 is the real guard):
-- self-update stays on your own row. There is nothing privilege-bearing to set.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----- SPINE: admin-write, member-read template -------------------------------
-- week_groups
create policy week_groups_select on public.week_groups
  for select to authenticated using (has_membership(teacher_id));
create policy week_groups_insert_admin on public.week_groups
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy week_groups_update_admin on public.week_groups
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy week_groups_delete_admin on public.week_groups
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- channels
create policy channels_select on public.channels
  for select to authenticated using (has_membership(teacher_id));
create policy channels_insert_admin on public.channels
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy channels_update_admin on public.channels
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy channels_delete_admin on public.channels
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- topics
create policy topics_select on public.topics
  for select to authenticated using (has_membership(teacher_id));
create policy topics_insert_admin on public.topics
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy topics_update_admin on public.topics
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy topics_delete_admin on public.topics
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- content_items
create policy content_items_select on public.content_items
  for select to authenticated using (has_membership(teacher_id));
create policy content_items_insert_admin on public.content_items
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy content_items_update_admin on public.content_items
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy content_items_delete_admin on public.content_items
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- classroom_folders
create policy classroom_folders_select on public.classroom_folders
  for select to authenticated using (has_membership(teacher_id));
create policy classroom_folders_insert_admin on public.classroom_folders
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy classroom_folders_update_admin on public.classroom_folders
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy classroom_folders_delete_admin on public.classroom_folders
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- classroom_recordings
create policy classroom_recordings_select on public.classroom_recordings
  for select to authenticated using (has_membership(teacher_id));
create policy classroom_recordings_insert_admin on public.classroom_recordings
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy classroom_recordings_update_admin on public.classroom_recordings
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy classroom_recordings_delete_admin on public.classroom_recordings
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- events
create policy events_select on public.events
  for select to authenticated using (has_membership(teacher_id));
create policy events_insert_admin on public.events
  for insert to authenticated with check (is_teacher_admin(teacher_id));
create policy events_update_admin on public.events
  for update to authenticated using (is_teacher_admin(teacher_id)) with check (is_teacher_admin(teacher_id));
create policy events_delete_admin on public.events
  for delete to authenticated using (is_teacher_admin(teacher_id));

-- ----- SPINE: posts (member-create gated by channel permission OR admin) -------
create policy posts_select on public.posts
  for select to authenticated using (has_membership(teacher_id));
-- [Item 4] SAME-TEACHER SAFETY: this policy does NOT re-check that the channel's
-- teacher_id equals the post's — it RELIES on the composite FK
-- posts_channel_same_teacher_fkey to guarantee it. If that FK is ever weakened or
-- dropped, the channel-permission branch below could open a cross-teacher path
-- (a member posting into another teacher's 'all' channel). Keep them in lockstep.
create policy posts_insert_channel_permitted on public.posts
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and has_membership(teacher_id)
    and (
      -- channel must allow 'all'… (composite FK already guarantees same-teacher)
      exists (select 1 from public.channels c where c.id = posts.channel_id and c.post_permission = 'all')
      -- …or the caller is an admin of this teacher (also covers channel_id IS NULL)
      or is_teacher_admin(teacher_id)
    )
  );
create policy posts_update_owner_or_admin on public.posts
  for update to authenticated
  using ((author_id = auth.uid() and has_membership(teacher_id)) or is_teacher_admin(teacher_id))
  with check ((author_id = auth.uid() and has_membership(teacher_id)) or is_teacher_admin(teacher_id));
create policy posts_delete_owner_or_admin on public.posts
  for delete to authenticated
  using ((author_id = auth.uid() and has_membership(teacher_id)) or is_teacher_admin(teacher_id));

-- ----- LEAVES: scope via single PK lookup into the parent ----------------------
-- comments (1-hop → posts)
create policy comments_select on public.comments
  for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id))
  );
create policy comments_update_own on public.comments
  for update to authenticated
  using (author_id = auth.uid()
         and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)))
  with check (author_id = auth.uid()
         and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));
create policy comments_delete_own on public.comments
  for delete to authenticated
  using (author_id = auth.uid()
         and has_membership((select p.teacher_id from public.posts p where p.id = comments.post_id)));

-- post_images (1-hop → posts; must own the post)
create policy post_images_select on public.post_images
  for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_images.post_id)));
create policy post_images_insert_own on public.post_images
  for insert to authenticated
  with check (exists (select 1 from public.posts p
                      where p.id = post_images.post_id
                        and p.author_id = auth.uid()
                        and has_membership(p.teacher_id)));
create policy post_images_delete_own on public.post_images
  for delete to authenticated
  using (exists (select 1 from public.posts p
                 where p.id = post_images.post_id
                   and p.author_id = auth.uid()
                   and has_membership(p.teacher_id)));

-- post_attachments (1-hop → posts; must own the post)
create policy post_attachments_select on public.post_attachments
  for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_attachments.post_id)));
create policy post_attachments_insert_own on public.post_attachments
  for insert to authenticated
  with check (exists (select 1 from public.posts p
                      where p.id = post_attachments.post_id
                        and p.author_id = auth.uid()
                        and has_membership(p.teacher_id)));
create policy post_attachments_delete_own on public.post_attachments
  for delete to authenticated
  using (exists (select 1 from public.posts p
                 where p.id = post_attachments.post_id
                   and p.author_id = auth.uid()
                   and has_membership(p.teacher_id)));

-- post_videos (1-hop → posts; ADMIN of the post's teacher — NO author conjunct)
-- [Item 3] WHY no author_id = auth.uid() here: post_videos is an admin-only feature
-- end to end (non-admins create posts without video; only admins ever attach one).
-- The live single-tenant edit flow (updatePost) already lets an admin add/replace/
-- remove a video on ANOTHER member's post — it does so through the SERVICE-ROLE
-- client, which bypasses RLS. Gating on is_teacher_admin alone expresses that exact
-- capability truthfully in RLS, so if a future refactor moves the edit flow off
-- service-role onto the authenticated client, admins are NOT silently blocked from
-- managing members' videos. (Faithful to the capability, not to prod's vestigial
-- author-AND-admin RLS, which the app routes around anyway.)
create policy post_videos_select on public.post_videos
  for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));
create policy post_videos_insert_admin on public.post_videos
  for insert to authenticated
  with check (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));
create policy post_videos_update_admin on public.post_videos
  for update to authenticated
  using (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)))
  with check (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));
create policy post_videos_delete_admin on public.post_videos
  for delete to authenticated
  using (is_teacher_admin((select p.teacher_id from public.posts p where p.id = post_videos.post_id)));

-- post_likes (1-hop → posts; own row)
create policy post_likes_select on public.post_likes
  for select to authenticated
  using (has_membership((select p.teacher_id from public.posts p where p.id = post_likes.post_id)));
create policy post_likes_insert_own on public.post_likes
  for insert to authenticated
  with check (user_id = auth.uid()
              and has_membership((select p.teacher_id from public.posts p where p.id = post_likes.post_id)));
create policy post_likes_delete_own on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

-- comment_likes (2-hop → comments → posts; own row)  [A2]
create policy comment_likes_select on public.comment_likes
  for select to authenticated
  using (has_membership((
    select p.teacher_id from public.posts p
    join public.comments c on c.post_id = p.id
    where c.id = comment_likes.comment_id)));
create policy comment_likes_insert_own on public.comment_likes
  for insert to authenticated
  with check (user_id = auth.uid()
    and has_membership((
      select p.teacher_id from public.posts p
      join public.comments c on c.post_id = p.id
      where c.id = comment_likes.comment_id)));
create policy comment_likes_delete_own on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

-- content_progress (1-hop → content_items; own row + membership)
create policy content_progress_select_own on public.content_progress
  for select to authenticated
  using (user_id = auth.uid()
         and has_membership((select ci.teacher_id from public.content_items ci where ci.id = content_progress.content_item_id)));
create policy content_progress_insert_own on public.content_progress
  for insert to authenticated
  with check (user_id = auth.uid()
         and has_membership((select ci.teacher_id from public.content_items ci where ci.id = content_progress.content_item_id)));
create policy content_progress_delete_own on public.content_progress
  for delete to authenticated using (user_id = auth.uid());

-- classroom_recording_progress (1-hop → classroom_recordings; own row + membership)
create policy crp_select_own on public.classroom_recording_progress
  for select to authenticated
  using (user_id = auth.uid()
         and has_membership((select r.teacher_id from public.classroom_recordings r where r.id = classroom_recording_progress.recording_id)));
create policy crp_insert_own on public.classroom_recording_progress
  for insert to authenticated
  with check (user_id = auth.uid()
         and has_membership((select r.teacher_id from public.classroom_recordings r where r.id = classroom_recording_progress.recording_id)));
create policy crp_delete_own on public.classroom_recording_progress
  for delete to authenticated using (user_id = auth.uid());


-- =============================================================================
-- SECTION 9 — storage.objects RLS  [D4/A3] path scheme {teacher_id}/{uid}/...
-- =============================================================================
-- foldername(name)[1] = teacher_id, [2] = uid. Write RLS checks BOTH:
--   • has_membership(teacher_id-from-path)  AND
--   • uid-segment == auth.uid()
-- A malformed (non-uuid) teacher segment makes the ::uuid cast raise → the write
-- is rejected (fails closed). Buckets themselves are created in the seed file.
--
-- [D4] avatars + post-images stay PUBLIC-READ. content-files is a KNOWN public-read
-- gap (see the FLAG below) — private bucket + signed URLs is the deferred fix.

-- IDEMPOTENT RE-RUN: storage.objects lives in the `storage` schema, which a
-- `drop schema public cascade` does NOT touch — so these policies persist across
-- re-applications and would collide ("policy ... already exists"). Each create below
-- is therefore preceded by a matching `drop policy if exists`. (Public-schema tables
-- need no such guard — they vanish with the schema drop.)

-- avatars  ({teacher_id}/{uid}/avatar.jpg) — public read
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);

-- post-images  ({teacher_id}/{uid}/{post_id}/{pos}.jpg) — public read
drop policy if exists post_images_obj_select on storage.objects;
create policy post_images_obj_select on storage.objects
  for select to authenticated using (bucket_id = 'post-images');
drop policy if exists post_images_obj_insert_own on storage.objects;
create policy post_images_obj_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists post_images_obj_delete_own on storage.objects;
create policy post_images_obj_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);

-- post-attachments  ({teacher_id}/{uid}/{post_id}/{pos}.pdf) — public read
drop policy if exists post_attachments_obj_insert_own on storage.objects;
create policy post_attachments_obj_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-attachments'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists post_attachments_obj_delete_own on storage.objects;
create policy post_attachments_obj_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-attachments'
    and has_membership(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text);

-- topic-covers  ({teacher_id}/...) — admin write, member read
drop policy if exists topic_covers_select on storage.objects;
create policy topic_covers_select on storage.objects
  for select to authenticated using (bucket_id = 'topic-covers');
drop policy if exists topic_covers_insert_admin on storage.objects;
create policy topic_covers_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'topic-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists topic_covers_update_admin on storage.objects;
create policy topic_covers_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'topic-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists topic_covers_delete_admin on storage.objects;
create policy topic_covers_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'topic-covers' and is_teacher_admin(((storage.foldername(name))[1])::uuid));

-- content-files  ({teacher_id}/...) — admin write.
-- *** FLAG [D4]: SELECT is bucket-scoped + the bucket is PUBLIC-READ, so a public
-- object URL bypasses RLS and is NOT tenant-isolated. This is the accepted v1 gap;
-- the fix (private bucket + signed URLs) is deferred. The path scheme below is the
-- expensive-to-change part and is correct now. ***
drop policy if exists content_files_select on storage.objects;
create policy content_files_select on storage.objects
  for select to authenticated using (bucket_id = 'content-files');
drop policy if exists content_files_insert_admin on storage.objects;
create policy content_files_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content-files' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists content_files_update_admin on storage.objects;
create policy content_files_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'content-files' and is_teacher_admin(((storage.foldername(name))[1])::uuid));
drop policy if exists content_files_delete_admin on storage.objects;
create policy content_files_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'content-files' and is_teacher_admin(((storage.foldername(name))[1])::uuid));


-- =============================================================================
-- FLAGGED FOLLOW-UPS (NOT carried into this Phase 1 foundation — call out, don't bury)
-- =============================================================================
-- 1. delete_my_account(): the single-tenant version is intentionally OMITTED. It
--    referenced the now-removed global is_admin and enumerated single-tenant storage
--    paths. A multi-tenant rewrite must: (a) decide whether deletion is global
--    (kill the auth.users row + tombstone profile) or per-teacher (revoke a
--    membership) — these are different operations now; (b) block on per-teacher
--    is_teacher_admin, not a global flag; (c) enumerate teacher-scoped storage paths
--    {teacher_id}/{uid}/... across every teacher the user belongs to. Scope this
--    deliberately — it is NOT part of the Phase 1 isolation foundation.
-- 2. [D7] Bunny video isolation: in a unified app all libraries trust the same
--    origin, so referrer protection no longer isolates BETWEEN tenants. Inter-tenant
--    video isolation for BOTH classroom_recordings AND post_videos now rests on (a)
--    RLS over those tables (you only learn video_ids for your teacher) + (b)
--    unguessable video_ids. Accepted v1 call — documented so it is conscious.
-- 3. teachers public branding before login (landing/login page) needs a separate
--    public-read view or unauthenticated policy — deferred to parameterization.
-- =============================================================================
-- End of PROPOSAL_schema.sql — REVIEW ONLY. Do not run until approved.
-- =============================================================================
