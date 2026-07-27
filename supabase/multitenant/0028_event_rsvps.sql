-- =====================================================================
-- 0028_event_rsvps.sql   (MULTI-TENANT)
-- Event RSVP: a member marks "attending" on an event. One row per (event, user).
-- Reads are gated by membership of the EVENT'S teacher (no cross-tenant leak); a
-- member may only add/remove their OWN RSVP.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.event_rsvps (
    event_id   uuid not null,
    user_id    uuid not null,
    created_at timestamptz default now(),
    constraint event_rsvps_pkey primary key (event_id, user_id),
    constraint event_rsvps_event_fkey foreign key (event_id) references public.events(id)   on delete cascade,
    constraint event_rsvps_user_fkey  foreign key (user_id)  references public.profiles(id) on delete cascade
);
create index if not exists event_rsvps_event_idx on public.event_rsvps (event_id);

alter table public.event_rsvps enable row level security;

-- SELECT — members of the event's teacher (counts + attendee list stay in-tenant).
drop policy if exists event_rsvps_select on public.event_rsvps;
create policy event_rsvps_select on public.event_rsvps
  for select to authenticated
  using (has_membership((select e.teacher_id from public.events e where e.id = event_rsvps.event_id)));

-- INSERT — your own RSVP, and only for an event in a teacher you belong to.
drop policy if exists event_rsvps_insert_own on public.event_rsvps;
create policy event_rsvps_insert_own on public.event_rsvps
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and has_membership((select e.teacher_id from public.events e where e.id = event_rsvps.event_id))
  );

-- DELETE — your own RSVP.
drop policy if exists event_rsvps_delete_own on public.event_rsvps;
create policy event_rsvps_delete_own on public.event_rsvps
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.event_rsvps to authenticated, service_role;
revoke all on public.event_rsvps from anon;
