-- When a reserved teammate completes their remaining duo event, preserve them
-- and create a separate pending record for their newly selected teammate.
create or replace function public.complete_partner_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row registrations%rowtype;
  v_slug text := trim(payload->>'eventSlug');
  v_category text; v_locked_category text; v_capacity integer; v_team_size integer; v_count integer;
  v_partner_name text := nullif(trim(payload->>'partnerFullName'), '');
  v_partner_register_no text := nullif(trim(payload->>'partnerRegisterNo'), '');
  v_partner_email text := lower(nullif(trim(payload->>'partnerEmail'), ''));
  v_partner_phone text := nullif(trim(payload->>'partnerPhone'), '');
  v_partner_id text;
  v_pending_teammates jsonb := '[]'::jsonb;
begin
  select * into v_row
  from public.registrations
  where register_no = trim(payload->>'registerNumber') and status = 'pending_partner'
  for update;

  if not found then
    raise exception 'No pending teammate registration was found for this register number.';
  end if;
  if lower(v_row.email) <> lower(trim(payload->>'email')) or v_row.phone <> trim(payload->>'phone') then
    raise exception 'Email or phone does not match the reserved teammate details.';
  end if;

  select category into v_locked_category from public.events where slug = v_row.events->>0;
  select category, capacity, team_size into v_category, v_capacity, v_team_size
  from public.events where slug = v_slug for update;
  if v_category is null or v_category = v_locked_category then
    raise exception 'Choose one event from your remaining category.';
  end if;

  if v_team_size = 2 then
    if v_partner_name is null or v_partner_register_no is null or v_partner_email is null or v_partner_phone is null then
      raise exception 'Full teammate details are required for this two-person event.';
    end if;
    if v_partner_register_no like '8204%' then
      raise exception 'Your teammate register number belongs to our college. Registration is only for other colleges.';
    end if;
    if v_partner_email !~ '^[a-z0-9._%+-]+@gmail[.]com$' then
      raise exception 'Use a valid Gmail address for your teammate.';
    end if;
    if v_partner_phone !~ '^[6-9][0-9]{9}$' then
      raise exception 'Use a valid 10-digit phone number for your teammate.';
    end if;
    if v_partner_register_no = v_row.register_no or v_partner_email = lower(v_row.email) or v_partner_phone = v_row.phone then
      raise exception 'Your teammate must be a different person.';
    end if;
    if exists (
      select 1 from public.registrations
      where register_no = v_partner_register_no or lower(email) = v_partner_email or phone = v_partner_phone
    ) then
      raise exception 'Your teammate is already registered and cannot be added again.';
    end if;
  end if;

  select count(*) into v_count from public.registrations where events @> to_jsonb(v_slug);
  if v_capacity is not null and v_count + (case when v_team_size = 2 then 2 else 1 end) > v_capacity then
    raise exception '% does not have enough spaces for this registration.', (select name from public.events where slug = v_slug);
  end if;

  -- This is Member B: retain their identity and add only their remaining event.
  update public.registrations
  set full_name = trim(payload->>'fullName'),
      college_name = trim(payload->>'collegeName'),
      events = events || to_jsonb(v_slug),
      event_partners = case when v_team_size = 2 then
        coalesce(event_partners, '{}'::jsonb) || jsonb_build_object(v_slug, jsonb_build_object(
          'fullName', v_partner_name,
          'registerNumber', v_partner_register_no,
          'email', v_partner_email,
          'phone', v_partner_phone
        ))
      else coalesce(event_partners, '{}'::jsonb) end,
      status = 'complete'
  where id = v_row.id;

  -- This is Member C: create a new, separate record that waits for their remaining event.
  if v_team_size = 2 then
    v_partner_id := 'CA2026-' || lpad(nextval('registration_participant_seq')::text, 3, '0');
    insert into public.registrations (
      participant_id, full_name, register_no, college_name, email, phone, events,
      attendance, partner_full_name, partner_register_no, partner_email, partner_phone,
      event_partners, status
    ) values (
      v_partner_id, v_partner_name, v_partner_register_no, trim(payload->>'collegeName'),
      v_partner_email, v_partner_phone, jsonb_build_array(v_slug), false,
      trim(payload->>'fullName'), v_row.register_no, lower(trim(payload->>'email')), v_row.phone,
      jsonb_build_object(v_slug, jsonb_build_object(
        'fullName', trim(payload->>'fullName'),
        'registerNumber', v_row.register_no,
        'email', lower(trim(payload->>'email')),
        'phone', v_row.phone
      )),
      'pending_partner'
    );
    v_pending_teammates := jsonb_build_array(jsonb_build_object(
      'id', v_partner_id,
      'fullName', v_partner_name,
      'registerNumber', v_partner_register_no,
      'collegeName', trim(payload->>'collegeName'),
      'email', v_partner_email,
      'phone', v_partner_phone,
      'events', jsonb_build_array(v_slug),
      'partnerFullName', trim(payload->>'fullName'),
      'eventPartners', jsonb_build_object(v_slug, jsonb_build_object('fullName', trim(payload->>'fullName'))),
      'createdAt', now()
    ));
  end if;

  return jsonb_build_object(
    'id', v_row.participant_id,
    'registration_id', v_row.id,
    'created_at', v_row.created_at,
    'partner_full_name', coalesce(v_partner_name, v_row.partner_full_name),
    'events', (select events from public.registrations where id = v_row.id),
    'event_partners', (select event_partners from public.registrations where id = v_row.id),
    'pending_teammates', v_pending_teammates
  );
end;
$$;

grant execute on function public.complete_partner_registration(jsonb) to anon, authenticated;
