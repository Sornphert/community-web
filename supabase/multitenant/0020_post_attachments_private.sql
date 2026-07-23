-- =====================================================================
-- 0020_post_attachments_private.sql
--
-- Same class of hole as 0019, on the other file bucket: `post-attachments` was
-- PUBLIC, so a PDF attached to a post was fetchable by URL with no login and no
-- membership — including attachments on members-only posts, and across tenants.
-- There are currently zero attachment rows, so nothing is actually exposed today;
-- this closes the hole before the first upload rather than after.
--
-- NOTE the asymmetry with post-images: images are decorative and already leak via
-- the public homepage feed by design (public posts only), so that bucket stays
-- public. Attachments are documents — treated like classroom files (0019).
--
-- (A) Bucket → private. The /object/public/... route stops serving it.
-- (B) ADD a storage SELECT policy. There was none: with a public bucket, reads never
--     went through RLS at all (the old comment literally read "insert/delete only").
--     Private + no SELECT policy would deny everyone, so the policy is required, not
--     optional. Gate: active member of the OWNING teacher (path segment [1]).
--     Deliberately NOT the segment[2] = auth.uid() check used by the insert/delete
--     policies — an attachment is shared content for the whole community to read,
--     only its uploader may write it.
--
-- Reads become short-lived signed urls minted in lib/posts.ts on the USER's client,
-- so this policy is the enforcement point. Do not sign with service-role.
--
-- Standalone, hand-run, then reconciled into schema.sql (SECTION 9) + seed.sql
-- (bucket flag). Idempotent: re-run the whole script on any error.
-- =====================================================================

update storage.buckets set public = false where id = 'post-attachments';

drop policy if exists post_attachments_obj_select on storage.objects;
create policy post_attachments_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'post-attachments' and has_membership(((storage.foldername(name))[1])::uuid));
