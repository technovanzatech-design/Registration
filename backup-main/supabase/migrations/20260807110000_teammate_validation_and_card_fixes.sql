-- Public RPCs used only to continue a teammate reservation safely.
create or replace function public.reserved_teammate_by_register_no(p_register_no text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('registerNumber', r.register_no, 'email', r.email, 'phone', r.phone)
  from public.registrations r
  where r.register_no = trim(p_register_no) and r.status = 'pending_partner'
  limit 1;
$$;

create or replace function public.reserved_teammate_by_contact(p_email text, p_phone text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('registerNumber', r.register_no, 'email', r.email, 'phone', r.phone)
  from public.registrations r
  where r.status = 'pending_partner'
    and (lower(r.email) = lower(trim(p_email)) or r.phone = trim(p_phone))
  limit 1;
$$;

create or replace function public.registration_contact_owner(p_email text, p_phone text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('registerNumber', r.register_no, 'status', r.status)
  from public.registrations r
  where lower(r.email) = lower(trim(p_email)) or r.phone = trim(p_phone)
  limit 1;
$$;

create or replace function public.registration_card_details(p_participant_id text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('events', r.events, 'status', r.status, 'eventPartners', r.event_partners)
  from public.registrations r
  where r.participant_id = trim(p_participant_id)
  limit 1;
$$;

create or replace function public.teammate_event_count(p_register_no text, p_email text, p_phone text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('eventCount', jsonb_array_length(r.events))
  from public.registrations r
  where r.register_no = trim(p_register_no)
     or lower(r.email) = lower(trim(p_email))
     or r.phone = trim(p_phone)
  limit 1;
$$;

-- Database-level protection: the form cannot be bypassed with an invalid teammate email/phone.
create or replace function public.validate_registration_contact_and_events()
returns trigger language plpgsql set search_path = public as $$
begin
  if lower(trim(new.email)) !~ '^[a-z0-9._%+-]+@gmail[.]com$' then
    raise exception 'Use a valid Gmail address.';
  end if;
  if trim(new.phone) !~ '^[6-9][0-9]{9}$' then
    raise exception 'Use a valid 10-digit phone number.';
  end if;
  if jsonb_array_length(new.events) > 2 then
    raise exception 'Your teammate has already selected two events and cannot be added to another team event.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_registration_contact_and_events on public.registrations;
create trigger validate_registration_contact_and_events
before insert or update of email, phone, events on public.registrations
for each row execute function public.validate_registration_contact_and_events();

grant execute on function public.reserved_teammate_by_register_no(text) to anon, authenticated;
grant execute on function public.reserved_teammate_by_contact(text, text) to anon, authenticated;
grant execute on function public.registration_contact_owner(text, text) to anon, authenticated;
grant execute on function public.registration_card_details(text) to anon, authenticated;
grant execute on function public.teammate_event_count(text, text, text) to anon, authenticated;
