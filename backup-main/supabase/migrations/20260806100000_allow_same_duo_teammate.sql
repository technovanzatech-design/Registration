-- A pair may participate together in more than one two-member event.
create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_events text[] := array(select jsonb_array_elements_text(payload->'events'));
  v_slug text; v_category text; v_team_size integer; v_capacity integer; v_count integer;
  v_tech integer := 0; v_nontech integer := 0;
  v_id uuid; v_existing_partner_id uuid; v_participant_id text; v_first_partner jsonb; v_partner jsonb;
  v_partner_map jsonb := '{}'::jsonb; v_pending_teammates jsonb := '[]'::jsonb;
begin
  if coalesce(array_length(v_events, 1), 0) <> 2 or v_events[1] = v_events[2] then raise exception 'Select exactly one technical event and one non-technical event.'; end if;
  perform 1 from events where slug = any(v_events) order by slug for update;
  if (select count(*) from events where slug = any(v_events)) <> 2 then raise exception 'One selected event no longer exists.'; end if;
  if exists (select 1 from registrations where register_no = trim(payload->>'registerNumber') or lower(email) = lower(trim(payload->>'email')) or phone = trim(payload->>'phone')) then raise exception 'Your register number, email, or phone is already registered.'; end if;
  foreach v_slug in array v_events loop
    select category, team_size, capacity into v_category, v_team_size, v_capacity from events where slug = v_slug;
    if v_category = 'technical' then v_tech := v_tech + 1; else v_nontech := v_nontech + 1; end if;
    select count(*) into v_count from registrations where events @> to_jsonb(v_slug);
    if v_capacity is not null and v_count + (case when v_team_size = 2 then 2 else 1 end) > v_capacity then raise exception '% is full.', (select name from events where slug = v_slug); end if;
    if v_team_size = 2 then
      v_partner := case when v_slug = 'techtalks' then payload->'techTalkPartner' else payload->'funFeastPartner' end;
      if v_partner is null or nullif(trim(v_partner->>'fullName'), '') is null or nullif(trim(v_partner->>'registerNumber'), '') is null or nullif(trim(v_partner->>'email'), '') is null or nullif(trim(v_partner->>'phone'), '') is null then raise exception 'Full teammate details are required for %.', (select name from events where slug = v_slug); end if;
      if v_partner->>'registerNumber' = trim(payload->>'registerNumber') or lower(v_partner->>'email') = lower(trim(payload->>'email')) or v_partner->>'phone' = trim(payload->>'phone') then raise exception 'The % teammate must be a different person.', (select name from events where slug = v_slug); end if;
      if exists (select 1 from registrations where register_no = trim(v_partner->>'registerNumber') or lower(email) = lower(trim(v_partner->>'email')) or phone = trim(v_partner->>'phone')) then raise exception 'The % teammate is already registered.', (select name from events where slug = v_slug); end if;
      v_first_partner := coalesce(v_first_partner, v_partner);
      v_partner_map := v_partner_map || jsonb_build_object(v_slug, v_partner);
    end if;
  end loop;
  if v_tech <> 1 or v_nontech <> 1 then raise exception 'Select exactly one technical event and one non-technical event.'; end if;
  v_participant_id := 'CA2026-' || lpad(nextval('registration_participant_seq')::text, 3, '0');
  insert into registrations (participant_id, full_name, register_no, college_name, email, phone, events, attendance, partner_full_name, partner_register_no, partner_email, partner_phone, event_partners, status)
  values (v_participant_id, trim(payload->>'fullName'), trim(payload->>'registerNumber'), trim(payload->>'collegeName'), lower(trim(payload->>'email')), trim(payload->>'phone'), to_jsonb(v_events), false, v_first_partner->>'fullName', v_first_partner->>'registerNumber', lower(v_first_partner->>'email'), v_first_partner->>'phone', v_partner_map, 'complete') returning id into v_id;
  foreach v_slug in array v_events loop
    select team_size into v_team_size from events where slug = v_slug;
    if v_team_size = 2 then
      v_partner := v_partner_map->v_slug;
      select id into v_existing_partner_id from registrations where register_no = v_partner->>'registerNumber';
      if found then
        update registrations set events = events || to_jsonb(v_slug), status = 'complete', event_partners = event_partners || jsonb_build_object(v_slug, jsonb_build_object('fullName', trim(payload->>'fullName'))) where id = v_existing_partner_id;
      else
        v_participant_id := 'CA2026-' || lpad(nextval('registration_participant_seq')::text, 3, '0');
        insert into registrations (participant_id, full_name, register_no, college_name, email, phone, events, attendance, partner_full_name, partner_register_no, partner_email, partner_phone, event_partners, status)
        values (v_participant_id, v_partner->>'fullName', v_partner->>'registerNumber', trim(payload->>'collegeName'), lower(v_partner->>'email'), v_partner->>'phone', jsonb_build_array(v_slug), false, trim(payload->>'fullName'), trim(payload->>'registerNumber'), lower(trim(payload->>'email')), trim(payload->>'phone'), jsonb_build_object(v_slug, jsonb_build_object('fullName', trim(payload->>'fullName'))), 'pending_partner');
        v_pending_teammates := v_pending_teammates || jsonb_build_array(jsonb_build_object('id', v_participant_id, 'fullName', v_partner->>'fullName', 'registerNumber', v_partner->>'registerNumber', 'collegeName', trim(payload->>'collegeName'), 'email', lower(v_partner->>'email'), 'phone', v_partner->>'phone', 'events', jsonb_build_array(v_slug), 'partnerFullName', trim(payload->>'fullName'), 'createdAt', now()));
      end if;
    end if;
  end loop;
  return jsonb_build_object('id', (select participant_id from registrations where id = v_id), 'registration_id', v_id, 'created_at', now(), 'partner_full_name', v_first_partner->>'fullName', 'pending_teammates', v_pending_teammates);
end;
$$;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;
