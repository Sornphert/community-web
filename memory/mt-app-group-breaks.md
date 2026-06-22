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
