-- Normalize older saved contact values. Some previous pending teammate rows
-- can contain invisible leading/trailing spaces, causing a false mismatch
-- when Member B completes their registration.
update public.registrations
set register_no = trim(register_no),
    email = lower(trim(email)),
    phone = trim(phone),
    partner_register_no = nullif(trim(partner_register_no), ''),
    partner_email = nullif(lower(trim(partner_email)), ''),
    partner_phone = nullif(trim(partner_phone), '');

-- Normalize every future insert/update before the validation and unique checks.
create or replace function public.validate_registration_contact_and_events()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.register_no := trim(new.register_no);
  new.email := lower(trim(new.email));
  new.phone := trim(new.phone);
  new.partner_register_no := nullif(trim(new.partner_register_no), '');
  new.partner_email := nullif(lower(trim(new.partner_email)), '');
  new.partner_phone := nullif(trim(new.partner_phone), '');

  if new.email !~ '^[a-z0-9._%+-]+@gmail[.]com$' then
    raise exception 'Use a valid Gmail address.';
  end if;
  if new.phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'Use a valid 10-digit phone number.';
  end if;
  if jsonb_array_length(new.events) > 2 then
    raise exception 'Your teammate has already selected two events and cannot be added to another team event.';
  end if;
  return new;
end;
$$;
