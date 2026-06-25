-- =============================================================================
-- 0001_delete_my_account_mt.sql — restore account deletion on the MT schema
-- =============================================================================
-- The single-tenant 0007 version referenced the now-removed profiles.is_admin
-- and single-tenant {uid}/... storage paths. This MT rewrite:
--   • Admin rule = OPTION A: block ONLY if deletion would drop some teacher to
--     ZERO active admins (caller is that teacher's LAST active admin). Returns
--     'last_admin' and NAMES the blocking teacher(s) so the error is actionable.
--   • Memberships: DELETE explicitly (profile is tombstoned, not deleted, so the
--     ON DELETE CASCADE never fires — a dead account would otherwise keep active
--     memberships and has_membership/is_teacher_admin would stay true for it).
--   • Tombstone clears social_links (PII); no is_admin column under MT.
--   • Enumerates storage across EVERY {teacher_id}/{uid}/... prefix the user
--     owns, across avatars + post-images + post-attachments.
--
-- SECURITY DEFINER + pinned search_path (matches has_membership/is_teacher_admin).
-- No params; uses auth.uid() => a caller can only delete THEMSELVES. Atomic; the
-- caller deletes the returned storage paths post-commit (storage isn't trans-
-- actional). Run by hand in the SQL editor (no CLI migration tooling in this repo).
-- Standalone create-or-replace: safe to run on live MT without re-running schema.sql.
-- The identical body is folded into multitenant/schema.sql Section 10.
-- =============================================================================

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

  -- Storage paths to return for post-commit cleanup by the caller.
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
