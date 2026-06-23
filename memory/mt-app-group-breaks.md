# MT conversion — app-group breaks & expected states

Tracks the (app) → /t/[slug] multi-tenant conversion: known breakages and
states that look like bugs but are intentional, with when each resolves.

## Status
- Foundation (/t/[slug] layout, gate, auth helpers): committed.
- Community vertical: ported, isolation-verified, committed (2e95d52).
- Remaining verticals (un-ported): classroom, events, weekly, members, admin.

## Expected states during Community port (verified 2026-06)

- **old (app)/weekly deleted** during the Community port (it reused community's
  components). Weekly is now fully un-routed (404 everywhere) until ported as its
  own vertical.
- **Per-teacher logo + hero image** still come from lib/config.ts defaults
  (Johnson's branding) on all teachers — the teachers table has no branding/logo
  column yet. Deferred to the branding parameterization pass. Teacher *name* is
  correctly scoped (proves the port); only the images aren't.
- **Un-ported verticals** (classroom, events, members, admin) 404 on /t/[slug]/...
  and their sidebar nav links still point at old single-tenant routes. Resolves as
  each vertical is ported. Not a bug.

## Known landmine for remaining verticals
- (app) routes read profiles.is_admin (removed under MT — role is memberships.role,
  resolved via the is_teacher_admin RPC). Every un-ported vertical still has this and
  must swap it during its port.
- Un-scoped spine reads under MT RLS do NOT error — they silently return cross-tenant
  rows. "It builds" proves nothing. Two-teacher persona isolation test is the only gate.

## Deferred / out-of-scope isolation gaps (log, don't solve)
- **Storage-content READ isolation (content-files + topic-covers).** Both buckets are
  public-read: `content_files_select` / `topic_covers_select` gate on `bucket_id` only with
  NO auth predicate. So a lesson PDF or topic cover is readable cross-tenant by anyone who
  has the direct CDN URL — the DB row (`content_items` / `topics`) is RLS-isolated, but the
  *file* is not. WRITE isolation IS intact: `*_insert_admin` gate on
  `is_teacher_admin(((storage.foldername(name))[1])::uuid)`, and the ported upload code writes
  `{teacher_id}/{uid}/...` (segment [1] = teacher_id is load-bearing; the uid segment is
  cosmetic — these buckets enforce only segment [1], no [2]=auth.uid() check).
- **Shared Bunny library (classroom recordings).** One `BUNNY_STREAM_LIBRARY_ID` per
  deployment → all teachers' videos live in one library. DB rows (`classroom_recordings`) are
  RLS-isolated by teacher_id, but a leaked `video_id`/player URL plays cross-tenant straight
  from Bunny. Same class of gap as the storage-read one above.
- Both are read-side content-isolation gaps with write-side isolation intact; explicitly out
  of scope for the Phase 2 route port (revisit alongside the branding/parameterization pass).

## Classroom port — sub-system split (in progress 2026-06)
- Classroom = TWO sub-systems. **A) content/topics** (topics, content_items, content_progress;
  /classroom, /topic/[id], /content/[id]; documents + topic-covers admin) and **B) recordings**
  (classroom_folders, classroom_recordings, recording_progress; Bunny + webhook; recordings
  admin CRUD). Ported A first, then B — each cut over atomically.
- The hardcoded single-tenant `RECORDINGS_TOPIC_ID` UUID is GONE — the recordings entry topic
  is now per-teacher via `topics.is_recordings` (one per teacher, partial-unique-indexed).
- During the A→B gap, the ported classroom landing's Recordings card links to
  `/t/[slug]/classroom/recordings` (a B route) — dangles until B ships in the same session.

## Weekly — intentionally skipped (revisit with parameterization pass)
- old (app)/weekly was deleted during the Community port; /t/[slug]/weekly NOT built.
- Weekly 404s everywhere — this is DELIBERATE, not a bug.
- Decision: skip Weekly for now; port it later together with its per-teacher on/off
  switch (needs the teachers.config settings column, same as branding). Building it
  now would mean a global flag + a retrofit later; building it later = one clean pass.
