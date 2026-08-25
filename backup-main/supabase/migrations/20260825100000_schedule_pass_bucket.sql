alter table public.email_delivery_log drop constraint if exists email_delivery_log_card_bucket_check;
alter table public.email_delivery_log add constraint email_delivery_log_card_bucket_check check (card_bucket in ('entry-passes', 'teammate-entry-passes', 'schedule-passes'));

insert into storage.buckets (id, name, public) values ('schedule-passes', 'schedule-passes', true)
on conflict (id) do update set public = true;

drop policy if exists "Admins can upload schedule passes" on storage.objects;
create policy "Admins can upload schedule passes" on storage.objects for insert to authenticated
with check (bucket_id = 'schedule-passes' and exists (select 1 from public.admin_profiles where id = auth.uid()));

drop policy if exists "Admins can update schedule passes" on storage.objects;
create policy "Admins can update schedule passes" on storage.objects for update to authenticated
using (bucket_id = 'schedule-passes' and exists (select 1 from public.admin_profiles where id = auth.uid()))
with check (bucket_id = 'schedule-passes' and exists (select 1 from public.admin_profiles where id = auth.uid()));
