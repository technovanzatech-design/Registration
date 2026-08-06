-- Final event catalogue and atomic two-person registration workflow.
-- Capacities are participant seats: TechTalks and Fun Feast therefore allow 15 teams.

alter table public.events
  add column if not exists category text not null default 'non-technical'
    check (category in ('technical', 'non-technical')),
  add column if not exists team_size integer not null default 1
    check (team_size in (1, 2));

delete from public.events
where slug not in ('webnova', 'techtalks', 'prompt-maestro', 'codefusion', 'fun-feast', 'brain-battle', 'nexus', 'checkmate-challenge');

insert into public.events (slug, name, category, team_size, capacity) values
  ('webnova', 'WebNova', 'technical', 1, 30),
  ('techtalks', 'TechTalks', 'technical', 2, 30),
  ('prompt-maestro', 'Prompt Maestro', 'technical', 1, 30),
  ('codefusion', 'CodeFusion', 'technical', 1, 30),
  ('fun-feast', 'Fun Feast', 'non-technical', 2, 30),
  ('brain-battle', 'Brain Battle', 'non-technical', 1, 30),
  ('nexus', 'Nexus', 'non-technical', 1, 30),
  ('checkmate-challenge', 'Checkmate Challenge', 'non-technical', 1, 30)
on conflict (slug) do update set
  name = excluded.name, category = excluded.category,
  team_size = excluded.team_size, capacity = excluded.capacity;

alter table public.registrations
  add column if not exists partner_full_name text,
  add column if not exists partner_register_no text,
  add column if not exists partner_email text,
  add column if not exists partner_phone text,
  add column if not exists partner_registration_id uuid references public.registrations(id),
  add column if not exists status text not null default 'complete'
    check (status in ('complete', 'pending_partner'));

create unique index if not exists registrations_register_no_unique on public.registrations (register_no);
create unique index if not exists registrations_email_unique on public.registrations (lower(email));
create unique index if not exists registrations_phone_unique on public.registrations (phone);

create sequence if not exists public.registration_participant_seq;
select setval(
  'public.registration_participant_seq',
  greatest(
    coalesce((select max(substring(participant_id from '([0-9]+)$')::integer) from public.registrations), 0),
    coalesce((select last_value from public.registration_participant_seq), 0)
  )
);

create or replace view public.event_capacity_status as
select
  e.slug as event_slug, e.name as event_name, e.capacity,
  count(r.id) as registered_count,
  case when e.capacity is null then null else greatest(e.capacity - count(r.id), 0) end as seats_remaining,
  e.category, e.team_size
from public.events e
left join public.registrations r on r.events @> to_jsonb(e.slug::text)
group by e.slug, e.name, e.category, e.team_size, e.capacity;
alter view public.event_capacity_status set (security_invoker = true);

create or replace function public.registration_status(p_register_no text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_status text; v_locked_category text;
begin
  select r.status, e.category into v_status, v_locked_category
  from registrations r left join events e on e.slug = r.events->>0
  where r.register_no = trim(p_register_no);
  if v_status = 'pending_partner' then return 'pending_partner_' || v_locked_category; end if;
  return coalesce(v_status, 'new');
end;
$$;

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_events text[] := array(select jsonb_array_elements_text(payload->'events'));
  v_slug text; v_category text; v_team_size integer; v_capacity integer; v_count integer;
  v_tech integer := 0; v_nontech integer := 0; v_duo_count integer := 0;
  v_id uuid; v_partner_id uuid; v_participant_id text; v_primary_participant_id text;
  v_partner_name text := nullif(trim(payload->>'partnerFullName'), '');
  v_partner_register_no text := nullif(trim(payload->>'partnerRegisterNo'), '');
  v_partner_email text := lower(nullif(trim(payload->>'partnerEmail'), ''));
  v_partner_phone text := nullif(trim(payload->>'partnerPhone'), '');
begin
  if coalesce(array_length(v_events, 1), 0) <> 2 or v_events[1] = v_events[2] then
    raise exception 'Select exactly one technical event and one non-technical event.';
  end if;

  perform 1 from events where slug = any(v_events) order by slug for update;
  if (select count(*) from events where slug = any(v_events)) <> 2 then raise exception 'One selected event no longer exists.'; end if;

  foreach v_slug in array v_events loop
    select category, team_size, capacity into v_category, v_team_size, v_capacity from events where slug = v_slug;
    if v_category = 'technical' then v_tech := v_tech + 1; else v_nontech := v_nontech + 1; end if;
    if v_team_size = 2 then v_duo_count := v_duo_count + 1; end if;
    select count(*) into v_count from registrations where events @> to_jsonb(v_slug);
    if v_capacity is not null and v_count + (case when v_team_size = 2 then 2 else 1 end) > v_capacity then
      raise exception '% is full.', (select name from events where slug = v_slug);
    end if;
  end loop;
  if v_tech <> 1 or v_nontech <> 1 then raise exception 'Select exactly one technical event and one non-technical event.'; end if;
  if v_duo_count > 0 and (v_partner_name is null or v_partner_register_no is null or v_partner_email is null or v_partner_phone is null) then
    raise exception 'Full teammate details are required for a two-person event.';
  end if;
  if v_partner_register_no = trim(payload->>'registerNumber') or v_partner_email = lower(trim(payload->>'email')) or v_partner_phone = trim(payload->>'phone') then
    raise exception 'Your teammate must be a different person.';
  end if;
  if exists (select 1 from registrations where register_no = trim(payload->>'registerNumber') or lower(email) = lower(trim(payload->>'email')) or phone = trim(payload->>'phone')) then
    raise exception 'Your register number, email, or phone is already registered.';
  end if;
  if v_duo_count > 0 and exists (select 1 from registrations where register_no = v_partner_register_no or lower(email) = v_partner_email or phone = v_partner_phone) then
    raise exception 'Your teammate’s register number, email, or phone is already registered.';
  end if;

  v_participant_id := 'CA2026-' || lpad(nextval('registration_participant_seq')::text, 3, '0');
  v_primary_participant_id := v_participant_id;
  insert into registrations (participant_id, full_name, register_no, college_name, email, phone, events, attendance, partner_full_name, partner_register_no, partner_email, partner_phone, status)
  values (v_participant_id, trim(payload->>'fullName'), trim(payload->>'registerNumber'), trim(payload->>'collegeName'), lower(trim(payload->>'email')), trim(payload->>'phone'), to_jsonb(v_events), false, v_partner_name, v_partner_register_no, v_partner_email, v_partner_phone, 'complete') returning id into v_id;

  if v_duo_count > 0 then
    v_participant_id := 'CA2026-' || lpad(nextval('registration_participant_seq')::text, 3, '0');
    insert into registrations (participant_id, full_name, register_no, college_name, email, phone, events, attendance, partner_full_name, partner_register_no, partner_email, partner_phone, status)
    values (v_participant_id, v_partner_name, v_partner_register_no, trim(payload->>'collegeName'), v_partner_email, v_partner_phone,
      to_jsonb(array(select s from unnest(v_events) s join events e on e.slug = s where e.team_size = 2)), false,
      trim(payload->>'fullName'), trim(payload->>'registerNumber'), lower(trim(payload->>'email')), trim(payload->>'phone'), 'pending_partner')
    returning id into v_partner_id;
    update registrations set partner_registration_id = v_partner_id where id = v_id;
    update registrations set partner_registration_id = v_id where id = v_partner_id;
  end if;
  return jsonb_build_object('id', v_primary_participant_id, 'registration_id', v_id, 'created_at', now(), 'partner_full_name', v_partner_name);
end;
$$;

create or replace function public.complete_partner_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row registrations%rowtype; v_slug text := trim(payload->>'eventSlug'); v_category text; v_capacity integer; v_count integer; v_locked_category text;
begin
  select * into v_row from registrations where register_no = trim(payload->>'registerNumber') and status = 'pending_partner' for update;
  if not found then raise exception 'No pending teammate registration was found for this register number.'; end if;
  if lower(v_row.email) <> lower(trim(payload->>'email')) or v_row.phone <> trim(payload->>'phone') then raise exception 'Email or phone does not match the teammate details entered during registration.'; end if;
  select category into v_locked_category from events where slug = v_row.events->>0;
  select category, capacity into v_category, v_capacity from events where slug = v_slug for update;
  if v_category is null or v_category = v_locked_category then raise exception 'Choose one event from your remaining category.'; end if;
  select count(*) into v_count from registrations where events @> to_jsonb(v_slug);
  if v_capacity is not null and v_count >= v_capacity then raise exception '% is full.', (select name from events where slug = v_slug); end if;
  update registrations set full_name = trim(payload->>'fullName'), college_name = trim(payload->>'collegeName'), events = events || to_jsonb(v_slug), status = 'complete' where id = v_row.id;
  return jsonb_build_object('id', v_row.participant_id, 'registration_id', v_row.id, 'created_at', v_row.created_at, 'partner_full_name', v_row.partner_full_name);
end;
$$;

grant execute on function public.registration_status(text) to anon, authenticated;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;
grant execute on function public.complete_partner_registration(jsonb) to anon, authenticated;

-- Public clients must use the functions above; direct inserts would bypass capacity checks.
revoke insert on public.registrations from anon, authenticated;
drop trigger if exists trg_enforce_registration_rules on public.registrations;
