-- =====================================================================
-- 0012_posts_insert_grant.sql
-- Harden the authenticated INSERT grant on public.posts (mirror of the
-- 0011 UPDATE fix).
--
-- WHY: 0011 column-scoped the authenticated UPDATE grant so the three
-- public-visibility flags (is_public / hidden_from_public / featured) move
-- ONLY through the set_post_* SECURITY DEFINER RPCs. 0011 left the INSERT
-- grant full-column, and posts_insert_channel_permitted checks only
-- author / membership / channel permission — nothing about the flags — so an
-- authenticated member could name featured=true / is_public=true directly in a
-- raw INSERT, self-featuring to the public homepage and bypassing
-- set_post_featured's admin-only guard (and could likewise self-set is_public,
-- or backdate a post by naming created_at).
--
-- FIX: revoke the blanket INSERT and re-grant INSERT on the six CONTENT columns
-- the composer actually sets. The three flags then take their NOT NULL DEFAULT
-- false on every authenticated insert and are un-nameable by authenticated.
--
-- COLUMN LIST — the six columns the sole authenticated insert path
-- (new-post-form.tsx handleCreate) sets: id, author_id, teacher_id, title,
-- body, channel_id. EXCLUDED:
--   • is_public / hidden_from_public / featured — the flags (RPC-only).
--   • edited_at  — never set on create (null on insert; set later by the
--     service-role updatePost path, which bypasses this grant).
--   • created_at — defaults to now(); leaving it un-grantable also stops a
--     member backdating a post via a direct INSERT.
--
-- TIER 2 (grant tightening only; no column, no RLS-policy-body, no RPC
-- change). service_role (full CRUD) and the set_post_* / delete_my_account
-- SECURITY DEFINER functions are UNAFFECTED — definer functions run as their
-- owner and bypass caller column grants. Additive / deployment-neutral: the
-- sole authenticated insert path names exactly these six columns. Standalone,
-- hand-run in the Supabase SQL editor on community-mt-dev, then reconciled into
-- supabase/multitenant/schema.sql. Re-run the whole script on any error.
-- =====================================================================

-- Column-scoped INSERT grant on posts (mirrors the UPDATE grant in SECTION 7).
-- MUST stay AFTER the blanket combined grant (a fresh rebuild would otherwise
-- silently re-open the flag columns). Row eligibility is still governed by the
-- unchanged posts_insert_channel_permitted policy; this is column-level defense
-- ON TOP of it.
revoke insert on public.posts from authenticated;
grant  insert (id, author_id, teacher_id, title, body, channel_id)
  on public.posts to authenticated;

-- End of 0012. Run ONCE in the SQL editor on community-mt-dev, then reconcile
-- into supabase/multitenant/schema.sql.
