-- Keeps a permanent, admin-readable history of every entry-card email attempt.
-- This lets coordinators identify failures and resend a stored card safely.
create table if not exists public.email_delivery_log (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null,
  recipient_name text not null,
  recipient_email text not null,
  card_bucket text not null check (card_bucket in ('entry-passes', 'teammate-entry-passes')),
  card_path text not null,
  delivery_type text not null default 'registration'
    check (delivery_type in ('registration', 'pending_teammate', 'teammate_complete', 'manual_resend')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_delivery_log_participant_created_idx
  on public.email_delivery_log (participant_id, created_at desc);

drop policy if exists "admins can read email delivery log" on public.email_delivery_log;
alter table public.email_delivery_log enable row level security;
create policy "admins can read email delivery log"
  on public.email_delivery_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_profiles
      where admin_profiles.id = auth.uid()
    )
  );

-- A separate public bucket keeps provisional teammate cards apart from the
-- primary participant cards. It is useful for coordinator review/manual send.
insert into storage.buckets (id, name, public)
values ('teammate-entry-passes', 'teammate-entry-passes', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can upload teammate entry passes" on storage.objects;
create policy "Public can upload teammate entry passes"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'teammate-entry-passes');

drop policy if exists "Public can update teammate entry passes" on storage.objects;
create policy "Public can update teammate entry passes"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'teammate-entry-passes')
  with check (bucket_id = 'teammate-entry-passes');
