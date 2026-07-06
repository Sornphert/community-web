-- =============================================================================
-- 0007 — member roles (promote / demote admins)
-- =============================================================================
-- memberships is WRITE-LESS to authenticated: no INSERT/UPDATE/DELETE grant
-- (schema.sql SECTION 7) and no write RLS policy (only memberships_select_*). So a
-- role flip CANNOT go through plain RLS from the anon key. This SECURITY DEFINER RPC
-- is the ONLY authenticated write path into memberships.role.
--
-- It enforces the LAST-ADMIN INVARIANT transactionally: a teacher must NEVER be left
-- with zero active admins (there is no in-app recovery if it happens). The guard
-- LOCK-then-COUNTs the teacher's entire active-admin set in one transaction, so two
-- concurrent demotions serialize (locking only the target row would not).
--
-- Guard order is AUTHZ-BEFORE-OBSERVATION: the caller's admin check runs BEFORE any
-- lookup of the target, so a non-admin (or an admin of another teacher) can never use
-- the error code to probe who is / isn't a member. The caller is auth.uid() — never
-- a parameter.
--
-- This file and the copy in schema.sql SECTION 11 are BYTE-IDENTICAL (the function +
-- grant block below). Apply this migration to the live project out-of-band (like
-- every other MT migration) BEFORE running any RPC-direct probe.

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

-- =============================================================================
-- End of 0007_membership_roles.sql.
-- =============================================================================
