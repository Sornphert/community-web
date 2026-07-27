-- =====================================================================
-- 0031_pinned_posts.sql   (MULTI-TENANT)
-- Pinned posts: an admin pins a post to the top of its channel. pinned_at is the
-- flag (null = not pinned) + sort key. Admin-only via a SECURITY DEFINER RPC that
-- checks is_teacher_admin of the post's teacher (mirrors set_post_featured), so the
-- posts owner-or-admin UPDATE policy can't be used by an author to self-pin.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

alter table public.posts add column if not exists pinned_at timestamptz;

-- Feed order: pinned first (newest pin on top), then newest.
create index if not exists posts_channel_pinned_idx
  on public.posts (channel_id, pinned_at desc nulls last, created_at desc);

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
  update public.posts
    set pinned_at = case when p_value then now() else null end
    where id = p_post_id;
  return jsonb_build_object('success', true, 'pinned', p_value);
end;
$$;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;
