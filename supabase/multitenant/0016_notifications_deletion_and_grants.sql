-- =====================================================================
-- 0016_notifications_deletion_and_grants.sql
--
-- Closes two gaps left by 0013 (notifications) / 0014 (push_subscriptions):
--
--   (A) ACCOUNT DELETION. Both tables FK to public.profiles with ON DELETE
--       CASCADE, but delete_my_account() deliberately TOMBSTONES the profiles
--       row (it is kept so posts/comments still render "[Deleted user]") and
--       deletes only from auth.users — and profiles has NO FK to auth.users.
--       So the cascade NEVER fires and a deleted user's notifications +
--       push_subscriptions rows survive indefinitely. The push rows are the
--       sharp end: a deleted account's browser endpoint stays live and can
--       still receive OS-level pushes. This is the standing rule — "any new
--       user-content table or bucket must update delete_my_account in the
--       same change" — being paid down late.
--
--   (B) EXPLICIT GRANTS. 0013/0014 shipped with NO grant statements at all,
--       relying on the project's default privileges for new tables in public.
--       schema.sql Section 7 is explicit-by-design ("deterministic reproduction"
--       — anon is REVOKEd wholesale, then granted back column-scoped). Two
--       tables outside that block means a fresh project's privilege state is
--       whatever the defaults happen to be. Pinned here.
--
-- ACTOR ROWS ARE KEPT ON PURPOSE. notifications.actor_id is ON DELETE SET NULL,
-- and we do NOT delete or null the leaving user's actor rows: the tombstoned
-- profile is still joinable, so an existing notification correctly renders
-- "[Deleted user] liked your post" — identical to how their posts and comments
-- behave. Only rows where the leaving user is the RECIPIENT are removed.
--
-- Standalone, hand-run in the Supabase SQL editor (no CLI migration tooling in
-- this repo), then reconciled into supabase/multitenant/schema.sql. Idempotent:
-- re-run the whole script on any error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) Grants — notifications
--     SELECT / UPDATE (mark read) / DELETE for the recipient; RLS is the gate
--     (notifications_select_own / _update_own / _delete_own, all auth.uid()).
--     INSERT is REVOKED: 0013's model is that rows are written ONLY by the
--     SECURITY DEFINER triggers. Absence of an INSERT *policy* already blocks
--     a client insert; the REVOKE makes it unforgeable at the privilege layer
--     too, and survives a rebuild where default privileges grant CRUD on new
--     tables (same reasoning as the memberships write-less grant).
-- ---------------------------------------------------------------------
grant select, update, delete, truncate, references, trigger
  on public.notifications to authenticated;
revoke insert on public.notifications from authenticated;

-- ---------------------------------------------------------------------
-- (2) Grants — push_subscriptions
--     Full CRUD for the owner: lib/push/client.ts upserts (INSERT+UPDATE) on
--     subscribe and DELETEs by endpoint on unsubscribe. RLS own-only is the
--     gate. The send path (app/api/push/send) uses service_role, which is
--     already covered by schema.sql's "grant all ... to service_role" sweep.
-- ---------------------------------------------------------------------
grant select, insert, update, delete, truncate, references, trigger
  on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------
-- (3) anon — zero grants on both tables.
--     Notifications and push endpoints are strictly signed-in surfaces; neither
--     appears in the anon public-feed path. Explicit REVOKE mirrors Section 7's
--     "revoke all ... from anon" invariant so a fresh project cannot inherit a
--     stray default grant.
-- ---------------------------------------------------------------------
revoke all on public.notifications      from anon;
revoke all on public.push_subscriptions from anon;

-- ---------------------------------------------------------------------
-- (4) delete_my_account() — create-or-replace, adding steps (3b) and (3c).
--     Everything else is VERBATIM from schema.sql Section 10 / 0001. Diff is
--     the two new delete blocks and their comments.
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

-- ---------------------------------------------------------------------
-- (5) Backfill — purge rows already orphaned by tombstoned accounts before
--     this migration. No-op on a database where nobody has deleted yet.
-- ---------------------------------------------------------------------
delete from public.notifications n
 using public.profiles pr
 where pr.id = n.recipient_id
   and pr.deleted_at is not null;

delete from public.push_subscriptions ps
 using public.profiles pr
 where pr.id = ps.user_id
   and pr.deleted_at is not null;
