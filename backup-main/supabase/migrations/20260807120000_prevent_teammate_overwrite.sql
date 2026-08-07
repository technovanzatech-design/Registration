-- A completed participant must never be reused or overwritten as another person's teammate.
create or replace function public.prevent_completed_participant_event_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'complete'
     and new.events is distinct from old.events then
    raise exception 'Your teammate has already selected two events and cannot be added to another team event.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_completed_participant_event_change on public.registrations;
create trigger prevent_completed_participant_event_change
before update of events on public.registrations
for each row execute function public.prevent_completed_participant_event_change();
