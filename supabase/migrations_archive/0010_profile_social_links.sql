-- Profile social links (v1)
-- Run this in the Supabase SQL editor (no CLI migration tooling in this repo).
-- Adds a single jsonb column holding social handles keyed by platform, e.g.
-- {"instagram":"johndoe","website":"https://example.com"}. Absent key = not set.
-- No new RLS: existing profiles own-row UPDATE + authenticated SELECT cover it.

alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;
