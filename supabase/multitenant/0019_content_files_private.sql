-- =====================================================================
-- 0019_content_files_private.sql
--
-- Closes the standing v1 gap: `content-files` was a PUBLIC bucket, so every
-- classroom document was readable by anyone holding the URL — no login, no
-- membership, no tier check. Consequences:
--   • The tag entitlement system (0006/0010) did NOT protect documents. A member
--     without the required tag could not see a gated topic in the UI, but the file
--     itself was fetchable if the URL leaked.
--   • Revoking a membership did not revoke access. Anyone who had ever loaded a
--     document kept a permanent working link.
--   • It was not tenant-isolated: a URL is a URL, regardless of teacher.
--
-- FIX (two parts):
--   (A) Flip the bucket PRIVATE. The /object/public/... route stops serving it, so
--       an old URL is dead. Reads now require a short-lived SIGNED url.
--   (B) Tighten the storage SELECT policy from "any authenticated user" to "an active
--       member of the OWNING teacher". Signing a url performs a SELECT under RLS, so
--       this makes signing itself the enforcement point: a non-member (or a member of
--       a different teacher) cannot mint a url even if they know the path. Path
--       segment [1] is the teacher_id, matching the write policies.
--
-- Topic-level TAG gating is enforced in the APP: the classroom page resolves the item
-- through can_access_topic() before it ever asks for a signed url, and the url expires.
-- Storage RLS cannot cheaply join a path back to content_items, so membership is the
-- storage-layer floor and tags are the app-layer gate above it.
--
-- NOTE: signed urls are minted with the USER's client (not service-role) precisely so
-- policy (B) applies. Do not "optimise" that to the admin client.
--
-- Standalone, hand-run in the Supabase SQL editor, then reconciled into
-- supabase/multitenant/schema.sql. Idempotent: re-run the whole script on any error.
-- =====================================================================

-- (A) Bucket becomes private. Existing /object/public/content-files/... urls die by
--     design — that IS the vulnerability being closed. The app re-derives access from
--     content_items.document_storage_path.
update storage.buckets set public = false where id = 'content-files';

-- (B) SELECT requires active membership of the owning teacher (segment [1]).
--     Replaces the old `bucket_id = 'content-files'` blanket-authenticated rule.
drop policy if exists content_files_select on storage.objects;
create policy content_files_select on storage.objects for select to authenticated
  using (bucket_id = 'content-files' and has_membership(((storage.foldername(name))[1])::uuid));
