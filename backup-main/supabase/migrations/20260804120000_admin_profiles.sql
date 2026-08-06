-- Admin allow-list.
--
-- Why this exists: Supabase Auth alone just proves "this person knows an
-- email+password that exists in auth.users". It does NOT mean they're an
-- admin. This table is the actual authorization check: a signed-in user
-- only gets into the dashboard if their auth.users id also has a row here.
-- Nobody can insert their own row (see RLS below), so the only way in is
-- for you to add the row yourself from the Supabase SQL editor.

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;

-- An authenticated user may only read their OWN admin_profiles row.
-- This is what the app uses to answer "is the person who just logged in
-- actually an admin?" without ever exposing the full admin list.
drop policy if exists "admins can read own profile" on public.admin_profiles;
create policy "admins can read own profile"
  on public.admin_profiles
  for select
  to authenticated
  using (id = auth.uid());

-- No insert/update/delete policies are defined for the authenticated role,
-- so regular sign-ins can never grant themselves admin access. Rows are
-- managed only via the SQL editor / service role, i.e. by you.