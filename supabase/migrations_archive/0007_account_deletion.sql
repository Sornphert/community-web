-- Account Deletion (Part 1 — backend)
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- DO NOT run blindly: run the pre-flight diagnostics below FIRST.
--
-- Adds a shared, atomic account-deletion path required for App Store / Play
-- submission. A single SECURITY DEFINER function, public.delete_my_account(),
-- is called by web (Part 2) and mobile (Part 3). It can ONLY delete the calling
-- user (it reads auth.uid() and takes no parameters).
--
-- Deletion semantics:
--   - Admins are BLOCKED (must be demoted by another admin first).
--   - Everyone else: the profiles row is KEPT but tombstoned (display_name
--     '[Deleted user]', avatar_url/bio nulled, deleted_at set, is_admin false)
--     so posts/comments/likes keep rendering "[Deleted user]" via the join.
--   - Avatar + post-image FILES are removed from storage by the CALLER, using
--     the paths this function returns (storage is external and can't be deleted
--     transactionally from SQL). post_images ROWS are deleted here.
--   - content_progress + classroom_recording_progress rows are deleted.
--   - The auth.users row is deleted (revokes sessions, frees the email).
--
-- ---------------------------------------------------------------------------
-- PRE-FLIGHT DIAGNOSTICS (read-only — run these by hand BEFORE the migration)
-- ---------------------------------------------------------------------------
-- (a) Does profiles reference auth.users, and with what ON DELETE action?
--     confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL, d=SET DEFAULT
--
--   select conname, confdeltype
--   from pg_constraint
--   where conrelid = 'public.profiles'::regclass
--     and confrelid = 'auth.users'::regclass;
--
-- (b) FULL audit: every table that references auth.users. Anything NOT cascade
--     ('c') that this function does not already clear/delete would BLOCK the
--     "delete from auth.users" below — handle it before running.
--
--   select conrelid::regclass as referencing_table, conname, confdeltype
--   from pg_constraint
--   where confrelid = 'auth.users'::regclass;

-- ---------------------------------------------------------------------------
-- Schema: soft-delete column + partial index (small: only tombstoned users).
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles(deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- Drop the profiles -> auth.users FK so a tombstone profile can outlive the
-- deleted auth user. Without this, deleting auth.users cascade-deletes the
-- profile (canonical Supabase setup) and, via post_likes/comment_likes ->
-- profiles(id) ON DELETE CASCADE (see 0004), the likes we intend to keep.
-- Any FK on profiles -> auth.users (even non-cascade) blocks a true delete
-- while the profile exists, so we drop whatever it is named.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- public.delete_my_account()
--   SECURITY DEFINER: needs to delete from auth.users and tombstone the profile.
--   set search_path = public, auth: prevents search-path injection.
--   Takes NO parameters and uses auth.uid() => a user can only delete THEMSELVES.
--   All DB steps run in the function's single transaction => fully atomic.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  v_avatar_url text;
  v_avatar_paths text[] := '{}';
  v_post_image_paths text[];
begin
  -- Identify the caller from the JWT.
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- Block admin self-delete.
  select is_admin, avatar_url
    into v_is_admin, v_avatar_url
  from public.profiles
  where id = v_user_id;

  if coalesce(v_is_admin, false) then
    return jsonb_build_object('success', false, 'error', 'is_admin');
  end if;

  -- Collect storage paths to return for post-commit cleanup by the caller.
  if v_avatar_url is not null then
    v_avatar_paths := array[v_user_id::text || '/avatar.jpg'];
  end if;

  select coalesce(array_agg(pi.storage_path), '{}')
    into v_post_image_paths
  from public.post_images pi
  join public.posts p on p.id = pi.post_id
  where p.author_id = v_user_id;

  -- (1) Tombstone the profile (row KEPT so posts/comments show "[Deleted user]").
  update public.profiles
     set display_name = '[Deleted user]',
         avatar_url   = null,
         bio          = null,
         deleted_at   = now(),
         is_admin     = false
   where id = v_user_id;

  -- (2) Remove post_images rows for this user's posts (files removed by caller).
  delete from public.post_images
   where post_id in (select id from public.posts where author_id = v_user_id);

  -- (3) Progress tables.
  delete from public.content_progress where user_id = v_user_id;
  delete from public.classroom_recording_progress where user_id = v_user_id;

  -- (4) Defensive: detach admin-authored classroom rows (ex-admin edge case;
  --     created_by -> auth.users has NO cascade and would block the delete).
  update public.classroom_folders   set created_by = null where created_by = v_user_id;
  update public.classroom_recordings set created_by = null where created_by = v_user_id;

  -- (5) Delete the auth user (revokes sessions, frees the email). The profile
  --     row survives because the profiles -> auth.users FK was dropped above;
  --     auth.sessions / auth.identities / auth.refresh_tokens cascade in GoTrue.
  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'storage_paths', jsonb_build_object(
      'avatars', to_jsonb(v_avatar_paths),
      'post-images', to_jsonb(v_post_image_paths)
    )
  );
end;
$$;

-- The function's SECURITY DEFINER runs with elevated privileges; auth.uid()
-- ensures a user can only delete themselves.
grant execute on function public.delete_my_account() to authenticated;
