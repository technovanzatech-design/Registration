-- The public form uploads primary cards as anon. The admin dashboard is an
-- authenticated session, so it needs its own narrowly-scoped recovery policy.
drop policy if exists "admins can upload primary entry passes" on storage.objects;
create policy "admins can upload primary entry passes"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'entry-passes'
    and exists (
      select 1 from public.admin_profiles
      where admin_profiles.id = auth.uid()
    )
  );

drop policy if exists "admins can update primary entry passes" on storage.objects;
create policy "admins can update primary entry passes"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'entry-passes'
    and exists (
      select 1 from public.admin_profiles
      where admin_profiles.id = auth.uid()
    )
  )
  with check (
    bucket_id = 'entry-passes'
    and exists (
      select 1 from public.admin_profiles
      where admin_profiles.id = auth.uid()
    )
  );
