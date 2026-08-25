-- Allows the existing delivery log to distinguish schedule messages from
-- registration-card messages, while preserving the complete delivery history.
alter table public.email_delivery_log
  drop constraint if exists email_delivery_log_delivery_type_check;

alter table public.email_delivery_log
  add constraint email_delivery_log_delivery_type_check
  check (delivery_type in (
    'registration', 'pending_teammate', 'teammate_complete', 'manual_resend',
    'schedule', 'schedule_resend'
  ));

create index if not exists email_delivery_log_schedule_created_idx
  on public.email_delivery_log (registration_id, delivery_type, created_at desc);
