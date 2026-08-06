-- Registrations almost certainly only has an anon INSERT policy right
-- now (so the public registration form works). This adds a SELECT
-- policy scoped to admins only, so the dashboard can read the table
-- back without opening it up to anyone else.
--
-- This is additive — it does not touch your existing insert policy,
-- so the public registration form keeps working exactly as before.

drop policy if exists "admins can read all registrations" on public.registrations;
create policy "admins can read all registrations"
  on public.registrations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.id = auth.uid()
    )
  );