-- Recovery policy for the public teammate-card bucket. Both the public form
-- and an authenticated coordinator can create/recreate a teammate entry card.
drop policy if exists "Anyone can manage teammate entry passes" on storage.objects;
create policy "Anyone can manage teammate entry passes"
  on storage.objects
  for all
  to public
  using (bucket_id = 'teammate-entry-passes')
  with check (bucket_id = 'teammate-entry-passes');
