-- A participant may have a different teammate in each duo event.
alter table public.registrations
  add column if not exists event_partners jsonb not null default '{}'::jsonb;

create or replace function public.complete_partner_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row registrations%rowtype;
  v_slug text := trim(payload->>'eventSlug');
  v_category text; v_capacity integer; v_team_size integer; v_count integer; v_locked_category text;
  v_partner_name text := nullif(trim(payload->>'partnerFullName'), '');
  v_partner_register_no text := nullif(trim(payload->>'partnerRegisterNo'), '');
  v_partner_email text := lower(nullif(trim(payload->>'partnerEmail'), ''));
  v_partner_phone text := nullif(trim(payload->>'partnerPhone'), '');
  v_partner_participant_id text;
begin
  select * into v_row from registrations where register_no = trim(payload->>'registerNumber') and status = 'pending_partner' for update;
  if not found then raise exception 'No pending teammate registration was found for this register number.'; end if;
  if lower(v_row.email) <> lower(trim(payload->>'email')) or v_row.phone <> trim(payload->>'phone') then raise exception 'Email or phone does not match the teammate details entered during registration.'; end if;
  select category into v_locked_category from events where slug = v_row.events->>0;
  select category, capacity, team_size into v_category, v_capacity, v_team_size from events where slug = v_slug for update;
  if v_category is null or v_category = v_locked_category then raise exception 'Choose one event from your remaining category.'; end if;
  if v_team_size = 2 and (v_partner_name is null or v_partner_register_no is null or v_partner_email is null or v_partner_phone is null) then raise exception 'Full teammate details are required for this two-person event.'; end if;
  if v_team_size = 2 and (v_partner_register_no = v_row.register_no or v_partner_email = lower(v_row.email) or v_partner_phone = v_row.phone) then raise exception 'Your Fun Feast teammate must be a different person.'; end if;
  if v_team_size = 2 and exists (select 1 from registrations where register_no = v_partner_register_no or lower(email) = v_partner_email or phone = v_partner_phone) then raise exception 'Your Fun Feast teammate’s register number, email, or phone is already registered.'; end if;
  select count(*) into v_count from registrations where events @> to_jsonb(v_slug);
  if v_capacity is not null and v_count + (case when v_team_size = 2 then 2 else 1 end) > v_capacity then raise exception '% does not have enough spaces for this registration.', (select name from events where slug = v_slug); end if;
  update registrations set full_name = trim(payload->>'fullName'), college_name = trim(payload->>'collegeName'), events = events || to_jsonb(v_slug), event_partners = case when v_team_size = 2 then event_partners || jsonb_build_object(v_slug, jsonb_build_object('fullName', v_partner_name)) else event_partners end, status = 'complete' where id = v_row.id;
  if v_team_size = 2 then
    v_partner_participant_id := 'CA2026-' || lpad(nextval('registration_participant_seq')::text, 3, '0');
    insert into registrations (participant_id, full_name, register_no, college_name, email, phone, events, attendance, partner_full_name, partner_register_no, partner_email, partner_phone, event_partners, status)
    values (v_partner_participant_id, v_partner_name, v_partner_register_no, trim(payload->>'collegeName'), v_partner_email, v_partner_phone, jsonb_build_array(v_slug), false, trim(payload->>'fullName'), v_row.register_no, lower(trim(payload->>'email')), v_row.phone, jsonb_build_object(v_slug, jsonb_build_object('fullName', trim(payload->>'fullName'))), 'pending_partner');
  end if;
  return jsonb_build_object('id', v_row.participant_id, 'registration_id', v_row.id, 'created_at', v_row.created_at, 'partner_full_name', coalesce(v_partner_name, v_row.partner_full_name));
end;
$$;
grant execute on function public.complete_partner_registration(jsonb) to anon, authenticated;
