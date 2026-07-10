-- =====================================================================
-- 0011_public_posts.sql
-- Opt-in PUBLIC visibility for posts (additive; private default unchanged).
--
-- MODEL: a post is publicly visible iff
--   is_public = true AND hidden_from_public = false AND author NOT tombstoned.
--   • is_public          — author consent (author sets, revocable)
--   • hidden_from_public  — admin kill switch (unconditional, admin-only)
--   • featured            — admin prominence (admin-only; true only if visible)
--
-- ACCESS: anon / non-members read the public slice ONLY via the SECURITY
-- DEFINER RPC public_posts_feed(). posts/profiles/post_likes stay CLOSED to
-- anon at BOTH grant and RLS layers — this migration adds NO anon grant and
-- NO anon SELECT policy on any base table. Flag writes go ONLY through the
-- three SECURITY DEFINER RPCs; authenticated loses direct UPDATE on the flag
-- columns via a column-scoped grant (mirrors the profiles discipline).
--
-- TIER 2 (new columns + new SECURITY DEFINER RPCs + a column-grant tightening;
-- no change to any existing RLS policy body). Standalone, hand-run in the
-- Supabase SQL editor on community-mt-dev (no CLI migration tooling in this
-- repo), then reconciled into supabase/multitenant/schema.sql. Re-run the
-- whole script on any error. After apply, run anon RLS-direct probes BEFORE
-- any app code.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Columns — all NOT NULL DEFAULT false, so every existing row is
--     private on arrival. No backfill needed.
-- ---------------------------------------------------------------------
alter table public.posts
  add column if not exists is_public          boolean not null default false,
  add column if not exists hidden_from_public boolean not null default false,
  add column if not exists featured           boolean not null default false;

-- ---------------------------------------------------------------------
-- (2) Feed index — partial, matches public_posts_feed()'s hard WHERE.
--     Small (only opted-in, non-hidden rows); leads with teacher_id for the
--     per-teacher case, created_at desc for ordering. featured-first is a
--     top-level sort the planner adds; not part of the index.
-- ---------------------------------------------------------------------
create index if not exists posts_public_feed_idx
  on public.posts (teacher_id, created_at desc)
  where is_public and not hidden_from_public;

-- ---------------------------------------------------------------------
-- (3) Column-scoped UPDATE grant on posts (mirrors profiles in SECTION 7).
--     Today authenticated holds broad UPDATE via the combined table grant.
--     Strip it and re-grant UPDATE on CONTENT columns only, so the three
--     flag columns are unreachable by a direct client UPDATE — they move
--     ONLY through the definer RPCs below. Row eligibility is still governed
--     by the UNCHANGED posts_update_owner_or_admin policy; this is column-
--     level defense ON TOP of it.
--     Safe: the only direct posts UPDATE in the app (updatePost) runs via the
--     service-role client (bypasses grants) and already writes exactly these
--     three columns.
-- ---------------------------------------------------------------------
revoke update on public.posts from authenticated;
grant  update (title, body, edited_at) on public.posts to authenticated;

-- ---------------------------------------------------------------------
-- (4) set_post_public — AUTHOR consent toggle.
--     authz: caller is the post's author AND has ACTIVE membership.
--     Missing post and unauthorized caller collapse to ONE opaque
--     'not_authorized' (no cross-tenant / global existence oracle). The only
--     row datum read before the authz gate is author_id/teacher_id, used
--     solely to make the authz decision — never returned to an unauthorized
--     caller.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- (5) set_post_hidden — ADMIN kill switch (unconditional).
--     authz: caller is is_teacher_admin of the post's teacher. Missing post
--     and non-admin collapse to the same opaque 'not_authorized'.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- (6) set_post_featured — ADMIN prominence flag.
--     authz: is_teacher_admin of the post's teacher (same collapse rule).
--     Extra rule: p_value=true is REJECTED unless the post is CURRENTLY
--     is_public AND NOT hidden_from_public -> 'not_public'. This 'not_public'
--     branch is reachable ONLY after authz passes, so it never leaks state to
--     an unauthorized caller. Setting featured=false is always allowed.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- (7) public_posts_feed — the ONLY anon read path into public posts.
--     SECURITY DEFINER: bypasses posts/profiles/post_likes RLS, but the hard
--     WHERE + the fixed return columns cap exactly what leaves. Returns ONLY
--     the 9 whitelisted fields — NO post id, author id, channel_id, comments,
--     or commenter identity — so anon cannot pivot to any other endpoint.
--     p_teacher_id null => all teachers; set => that teacher only.
--     Order: featured first, then created_at desc.
-- ---------------------------------------------------------------------
create or replace function public.public_posts_feed(
  p_limit      int,
  p_offset     int,
  p_teacher_id uuid default null
)
returns table (
  display_name text,
  avatar_url   text,
  body         text,
  image_path   text,
  like_count   bigint,
  teacher_slug text,
  teacher_name text,
  featured     boolean,
  created_at   timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select
    pr.display_name,
    pr.avatar_url,
    p.body,
    (select pi.storage_path
       from public.post_images pi
      where pi.post_id = p.id
      order by pi."position" asc                            -- "position" is quoted in the table def
      limit 1)                                              as image_path,
    (select count(*)
       from public.post_likes pl
      where pl.post_id = p.id)                              as like_count,
    t.slug                                                  as teacher_slug,
    t.name                                                  as teacher_name,
    p.featured,
    p.created_at
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.teachers t  on t.id  = p.teacher_id
  where p.is_public
    and not p.hidden_from_public
    and pr.deleted_at is null                               -- author NOT tombstoned
    and (p_teacher_id is null or p.teacher_id = p_teacher_id)
  order by p.featured desc, p.created_at desc
  -- Bounded: a NULL/omitted limit defaults to 20 (NOT 0-rows); hard ceiling 100
  -- so an anon can never pull the whole public corpus in one call.
  limit  least(greatest(coalesce(p_limit, 20), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------
-- (8) Grants — flag RPCs to authenticated (internal authz gates them, exactly
--     as the membership write RPCs do); feed RPC to anon AND authenticated.
--     No table grants, no anon SELECT policies added anywhere.
-- ---------------------------------------------------------------------
grant execute on function public.set_post_public(uuid, boolean)   to authenticated;
grant execute on function public.set_post_hidden(uuid, boolean)   to authenticated;
grant execute on function public.set_post_featured(uuid, boolean) to authenticated;
grant execute on function public.public_posts_feed(int, int, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- (9) delete_my_account — FULL body re-declared (a function replace needs the
--     whole body). The ONLY change vs schema.sql SECTION 10 is the new step
--     (1b): un-publish the leaving user's posts (is_public = false), so a
--     departing user's opted-in posts drop out of public_posts_feed at the
--     SOURCE — belt-and-suspenders on top of the feed's `deleted_at is null`
--     filter. Everything else is BYTE-IDENTICAL to the current definition.
-- ---------------------------------------------------------------------
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

-- End of 0011. Run ONCE in the SQL editor on community-mt-dev, then reconcile
-- into supabase/multitenant/schema.sql.
