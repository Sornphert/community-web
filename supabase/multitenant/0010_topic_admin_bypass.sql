-- =====================================================================
-- 0010_topic_admin_bypass.sql
-- Admin bypass for the classroom tier-tag gate.
--
-- BUG: a teacher's ADMIN who lacks a required entitlement tag was denied
-- that teacher's own gated classroom content. content_items_select RLS is
--   has_membership(teacher_id) AND can_access_topic(topic_id)
-- and can_access_topic (0006) checked tag entitlement ONLY, with no admin
-- short-circuit, so an untagged admin got has_membership=true AND
-- can_access_topic=false -> denied at the DATA layer (content won't load).
-- Tags gate MEMBERS into tiers; they must never gate an admin OUT of their
-- own community's content.
--
-- FIX: CREATE OR REPLACE can_access_topic to add an is_teacher_admin
-- short-circuit as the FIRST disjunct, before the existing tag logic. The
-- two existing disjuncts are BYTE-IDENTICAL to 0006 — non-admin behavior is
-- unchanged (is_teacher_admin=false for non-admins adds nothing to their
-- path). No UI/TS change: getInaccessibleTopicIds, the grid lock badges, and
-- the content/[id] route guard all read locked-ness through this one RPC and
-- inherit the fix; they do NOT recompute tags in TS.
--
-- teacher_id: can_access_topic only receives p_topic_id, so teacher_id is
-- DERIVED by join to public.topics on p_topic_id (the function is already
-- SECURITY DEFINER, so it reads topics regardless of RLS). NULL-safe: a bogus
-- p_topic_id -> subquery NULL -> is_teacher_admin(null)=false -> falls through
-- to the unchanged tag logic (which, for a nonexistent topic, is not exists
-- -> true = open, exactly as before).
--
-- Applied out-of-band to community-mt-dev, then reconciled into
-- supabase/multitenant/schema.sql (in-place body replace; a comment there
-- notes 0010 supersedes 0006's body). TIER 1 (modifies an RLS security
-- function) — re-run the 0006 tag probes + new admin cells before shipping.
-- Single statement; on any error, fix and re-run the ENTIRE script.
-- =====================================================================

create or replace function public.can_access_topic(p_topic_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select
    -- ADMIN BYPASS (0010): a teacher's active admin may open ALL of that
    -- teacher's content regardless of tags. teacher_id is derived from the
    -- topic; is_teacher_admin(null)=false makes a bogus topic_id safe (falls
    -- through to the unchanged tag logic below).
    is_teacher_admin((select t.teacher_id from public.topics t where t.id = p_topic_id))
    -- UNGATED = OPEN: a topic with no topic_tags rows (or a null id) matches nothing
    -- → not exists → true. The "no tags accidentally locks everything" failure mode
    -- is structurally impossible.
    or not exists (select 1 from public.topic_tags tt where tt.topic_id = p_topic_id)
    -- OR the caller holds >= 1 of the topic's required tags (ANY-match). Teacher scope
    -- is automatic: a member's tags only reference tags of teachers they belong to.
    or exists (
      select 1
      from public.topic_tags tt
      join public.member_tags mt
        on mt.tag_id = tt.tag_id
       and mt.profile_id = auth.uid()
      where tt.topic_id = p_topic_id
    );
$$;
