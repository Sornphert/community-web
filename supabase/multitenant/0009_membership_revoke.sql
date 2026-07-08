-- =====================================================================
-- 0009_membership_revoke.sql
-- Adds admin revoke: flip an ACTIVE member to 'revoked' (the mirror of
-- 0008's approve/deny, which only ever transitions OUT of pending).
-- Applied out-of-band to community-mt-dev, then reconciled into
-- supabase/multitenant/schema.sql. Single transaction — on any error,
-- fix and re-run the ENTIRE script, not just the failing line.
--
-- No schema change (memberships already admits 'revoked'; no new column,
-- no policy change — memberships stays WRITE-LESS to authenticated, this
-- SECURITY DEFINER RPC is the only write path). One new function + grant.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1  revoke_membership — admin-only, active -> revoked. Mirrors the
-- set_membership_role guard EXACTLY (authz-before-observation +
-- last-admin lock-then-count), applied to a status flip instead of a
-- role flip. Two args, no status param: the destination is the fixed
-- constant 'revoked'. Also DEMOTES to member in the same UPDATE so a
-- re-approved former admin can never be silently restored as admin.
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
