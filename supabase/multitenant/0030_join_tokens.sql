-- =====================================================================
-- 0030_join_tokens.sql   (MULTI-TENANT)
-- Non-guessable invite links. Each teacher gets a random join token; the public
-- request-access link is /join/{token} instead of the guessable /t/{slug}/join.
--
-- SECURITY: tokens live in their OWN table with NO authenticated/anon SELECT — a
-- member must not be able to read other communities' tokens. Two SECURITY DEFINER
-- RPCs are the only read paths:
--   teacher_by_join_token(token)      → resolve the community for the join page
--   join_token_matches(teacher,token) → gate the request-to-join action
-- Storing the token OFF the teachers table also keeps `select * from teachers`
-- (used widely) working without leaking the token.
--
-- Standalone, hand-run, then reconciled into schema.sql. Idempotent.
-- =====================================================================

create table if not exists public.join_tokens (
    teacher_id uuid primary key references public.teachers(id) on delete cascade,
    token      text not null unique
                 default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
    created_at timestamptz default now()
);

-- Backfill one token per existing teacher.
insert into public.join_tokens (teacher_id)
select id from public.teachers
on conflict (teacher_id) do nothing;

-- RLS on, but NO select/insert/update/delete policy for authenticated or anon →
-- clients can't read or forge tokens. Only service_role (bypass) + the definer RPCs.
alter table public.join_tokens enable row level security;
revoke all on public.join_tokens from anon, authenticated;
grant all on public.join_tokens to service_role;

-- Resolve a community from an invite token (public join page).
create or replace function public.teacher_by_join_token(p_token text)
returns table (id uuid, slug text, name text, logo_url text, description text)
language sql security definer set search_path = public stable as $$
  select t.id, t.slug, t.name, t.logo_url, t.description
  from public.join_tokens jt
  join public.teachers t on t.id = jt.teacher_id
  where jt.token = p_token;
$$;
grant execute on function public.teacher_by_join_token(text) to anon, authenticated;

-- Every NEW teacher auto-gets a token (so join links work without a manual step).
create or replace function public.create_join_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.join_tokens (teacher_id) values (new.id)
  on conflict (teacher_id) do nothing;
  return new;
end $$;
drop trigger if exists teachers_create_join_token on public.teachers;
create trigger teachers_create_join_token after insert on public.teachers
  for each row execute function public.create_join_token();

-- Gate the request-to-join action: TRUE only if the token matches the teacher.
create or replace function public.join_token_matches(p_teacher_id uuid, p_token text)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.join_tokens
    where teacher_id = p_teacher_id and token = p_token
  );
$$;
grant execute on function public.join_token_matches(uuid, text) to authenticated;
