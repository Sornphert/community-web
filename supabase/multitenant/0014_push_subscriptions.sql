-- =====================================================================
-- 0014_push_subscriptions.sql
-- Web Push subscriptions — stores each browser's push endpoint so the push
-- send endpoint (app/api/push/send) can deliver an OS-level notification when a
-- notifications row is inserted (0013), even while the app is closed.
--
-- MODEL: one row per browser subscription (unique by endpoint). A user may have
-- several (phone, laptop, …). RLS is own-only: a signed-in user manages just
-- their own subscriptions from the browser (anon key). The send path uses the
-- service-role client (RLS-bypassing) to read a recipient's subscriptions and
-- to prune dead ones (410/404 from the push service).
--
-- Standalone, hand-run in the Supabase SQL editor, then reconciled into
-- supabase/multitenant/schema.sql. Idempotent: re-run on any error.
-- =====================================================================

create table if not exists public.push_subscriptions (
    id         uuid not null default gen_random_uuid(),
    user_id    uuid not null,
    endpoint   text not null,
    p256dh     text not null,
    auth       text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    constraint push_subscriptions_pkey primary key (id),
    constraint push_subscriptions_endpoint_key unique (endpoint),
    constraint push_subscriptions_user_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());
