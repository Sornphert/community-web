-- =====================================================================
-- 0008_membership_onboarding.sql
-- Adds pending-status onboarding: request + admin approve/deny.
-- Applied out-of-band to community-mt-dev, then reconciled into
-- supabase/multitenant/schema.sql. Single transaction — on any error,
-- fix and re-run the ENTIRE script, not just the failing line.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1  CHECK swap — admit 'pending'. Default stays 'active'.
-- ---------------------------------------------------------------------
alter table public.memberships drop constraint memberships_status_check;
alter table public.memberships add constraint memberships_status_check
  check (status = any (array['active','revoked','pending']));

-- ---------------------------------------------------------------------
-- 1.2  source column — attribution. Nullable; null = organic/no-link.
-- No grant change: authenticated holds table-level SELECT, anon has none.
-- ---------------------------------------------------------------------
alter table public.memberships add column source text;

-- ---------------------------------------------------------------------
-- 1.3  Tighten policy #4 — co-members must not read pending rows.
-- self-branch (own pending visible on join page) + admin-branch
-- (queue readable) unchanged; co-member branch now active-only.
-- ---------------------------------------------------------------------
drop policy memberships_select_self_or_comember on public.memberships;
create policy memberships_select_self_or_comember on public.memberships
  for select using (
    profile_id = auth.uid()
    or is_teacher_admin(teacher_id)
    or (has_membership(teacher_id) and status = 'active')
  );

-- ---------------------------------------------------------------------
-- 1.4  request_membership — any logged-in user, self-only.
-- Caller is auth.uid(), never a param. Idempotent via the existing
-- unique constraint. Revoked re-applications flip back to pending.
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
  -- authn
  if v_caller is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  -- teacher must exist
  if not exists (select 1 from public.teachers t where t.id = p_teacher_id) then
    return jsonb_build_object('success', false, 'error', 'unknown_teacher');
  end if;

  -- create-or-noop; unique constraint makes this race-safe
  insert into public.memberships (profile_id, teacher_id, role, status, source)
  values (v_caller, p_teacher_id, 'member', 'pending', p_source)
  on conflict on constraint memberships_profile_teacher_key do nothing;

  -- re-read under lock; exactly one row exists now
  select status into v_status
  from public.memberships
  where profile_id = v_caller and teacher_id = p_teacher_id
  for update;

  -- revoked -> re-apply: flip back to pending, restamp source
  if v_status = 'revoked' then
    update public.memberships
      set status = 'pending', source = p_source
      where profile_id = v_caller and teacher_id = p_teacher_id;
    v_status := 'pending';
  end if;

  -- active -> already a member (no-op); pending -> queued (no-op)
  return jsonb_build_object('success', true, 'status', v_status);
end;
$$;

grant execute on function public.request_membership(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 1.5  set_membership_status — admin approve/deny. Mirrors 0007.
-- authz-before-observation; only ever transitions OUT of pending.
-- Revoking an active member is deliberately OUT of scope here.
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
  -- authz first — no existence probing before this passes
  if not public.is_teacher_admin(p_teacher_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  -- whitelist target status
  if p_new_status not in ('active','revoked') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  -- target must currently be pending for THIS teacher
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