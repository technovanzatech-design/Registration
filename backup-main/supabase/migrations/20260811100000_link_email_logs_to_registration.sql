-- Receipt IDs are reset during testing, so they are not safe as the sole key
-- for email history. Use the permanent registrations.id UUID instead.
alter table public.email_delivery_log
  add column if not exists registration_id uuid references public.registrations(id) on delete cascade;

-- Remove stale log rows left from deleted test registrations. They can have
-- the same participant_id as a newer person but a different recipient email.
delete from public.email_delivery_log log
where not exists (
  select 1
  from public.registrations registration
  where registration.participant_id = log.participant_id
    and lower(registration.email) = lower(log.recipient_email)
);

update public.email_delivery_log log
set registration_id = registration.id
from public.registrations registration
where log.registration_id is null
  and registration.participant_id = log.participant_id
  and lower(registration.email) = lower(log.recipient_email);

create index if not exists email_delivery_log_registration_created_idx
  on public.email_delivery_log (registration_id, created_at desc);
