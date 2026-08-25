-- `upsert: true` reads an existing object before updating it. Keep this bucket
-- restricted to approved admin accounts while granting that missing SELECT step.
drop policy if exists "Authenticated users can manage schedule passes" on storage.objects;
drop policy if exists "Admins can read schedule passes" on storage.objects;

create policy "Admins can read schedule passes"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'schedule-passes'
    and exists (
      select 1 from public.admin_profiles
      where admin_profiles.id = auth.uid()
    )
  );