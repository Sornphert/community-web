-- Events: lightweight multi-day recurrence (v1)
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
--
-- "Repeat for N consecutive days" is materialized as one row per calendar day,
-- linked by a shared series_id. Single (non-repeating) events leave series_id
-- null. No RLS change: the existing events_*_admin policies (migration 0008)
-- already gate writes, and series_id is just another column on the same table.

alter table public.events add column if not exists series_id uuid;

create index if not exists events_series_id_idx on public.events (series_id);
