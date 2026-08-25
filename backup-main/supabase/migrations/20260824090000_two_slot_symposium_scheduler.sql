-- Fixed two-slot scheduling for TECHNOVANZA 2026.
-- This adds new scheduling tables only; registrations and event selections are never changed.

create table if not exists public.event_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references public.events(slug) on delete cascade,
  slot_number smallint not null check (slot_number in (1, 2)),
  schedule_date date not null default date '2026-08-29',
  start_time time not null,
  end_time time not null,
  room text not null,
  participant_capacity integer,
  team_capacity integer,
  unique (event_slug, slot_number),
  check (end_time > start_time),
  check (participant_capacity is null or participant_capacity > 0),
  check (team_capacity is null or team_capacity > 0)
);

create table if not exists public.techtalks_team_approvals (
  team_key text primary key,
  member_one_register_no text not null,
  member_two_register_no text not null,
  approved boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (member_one_register_no <> member_two_register_no)
);

create table if not exists public.event_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  event_slug text not null references public.events(slug) on delete cascade,
  slot_id uuid not null references public.event_schedule_slots(id) on delete cascade,
  assignment_source text not null default 'automatic' check (assignment_source in ('automatic', 'manual')),
  created_at timestamptz not null default now(),
  unique (registration_id, event_slug)
);

alter table public.event_schedule_slots enable row level security;
alter table public.techtalks_team_approvals enable row level security;
alter table public.event_schedule_assignments enable row level security;

drop policy if exists "admins manage event schedule slots" on public.event_schedule_slots;
drop policy if exists "admins manage techtalk approvals" on public.techtalks_team_approvals;
drop policy if exists "admins manage schedule assignments" on public.event_schedule_assignments;

create policy "admins manage event schedule slots" on public.event_schedule_slots for all to authenticated
using (exists (select 1 from public.admin_profiles a where a.id = auth.uid()))
with check (exists (select 1 from public.admin_profiles a where a.id = auth.uid()));
create policy "admins manage techtalk approvals" on public.techtalks_team_approvals for all to authenticated
using (exists (select 1 from public.admin_profiles a where a.id = auth.uid()))
with check (exists (select 1 from public.admin_profiles a where a.id = auth.uid()));
create policy "admins manage schedule assignments" on public.event_schedule_assignments for all to authenticated
using (exists (select 1 from public.admin_profiles a where a.id = auth.uid()))
with check (exists (select 1 from public.admin_profiles a where a.id = auth.uid()));

-- All times are the final fixed symposium slots. Capacities can be changed
-- from the admin page before generating the schedule.
insert into public.event_schedule_slots (event_slug, slot_number, start_time, end_time, room, participant_capacity, team_capacity) values
  ('prompt-maestro', 1, '11:15', '12:15', 'Artificial Intelligence Lab', 15, null),
  ('prompt-maestro', 2, '12:15', '13:15', 'Artificial Intelligence Lab', 15, null),
  ('webnova', 1, '11:15', '12:15', 'Artificial Intelligence Lab', 15, null),
  ('webnova', 2, '12:15', '13:15', 'Artificial Intelligence Lab', 15, null),
  ('codefusion', 1, '11:15', '12:15', 'Data Science Lab', 15, null),
  ('codefusion', 2, '12:15', '13:15', 'Data Science Lab', 15, null),
  ('techtalks', 1, '11:15', '12:15', 'Conference Hall', 12, 6),
  ('techtalks', 2, '12:15', '13:15', 'Conference Hall', 12, 6),
  ('brain-battle', 1, '11:15', '12:15', '2nd Year A', 10, null),
  ('brain-battle', 2, '12:15', '13:15', '2nd Year A', 10, null),
  ('fun-feast', 1, '11:15', '12:15', '3rd Year A', 26, 13),
  ('fun-feast', 2, '12:15', '13:15', '3rd Year A', 24, 12),
  ('nexus', 1, '11:15', '12:15', '3rd Year B', 16, 8),
  ('nexus', 2, '12:15', '13:15', '3rd Year B', 14, 7),
  ('checkmate-challenge', 1, '11:15', '12:15', 'Data Science Lab', 10, null),
  ('checkmate-challenge', 2, '12:15', '13:15', 'Data Science Lab', 10, null)
on conflict (event_slug, slot_number) do update set
  start_time = excluded.start_time, end_time = excluded.end_time, room = excluded.room,
  participant_capacity = excluded.participant_capacity, team_capacity = excluded.team_capacity;

create or replace view public.schedule_assignment_details as
select
  a.id, a.registration_id, r.participant_id, r.full_name, r.register_no, r.email,
  a.event_slug, e.name as event_name, e.team_size, s.slot_number, s.schedule_date,
  s.start_time, s.end_time, s.room, a.assignment_source, a.created_at
from public.event_schedule_assignments a
join public.registrations r on r.id = a.registration_id
join public.events e on e.slug = a.event_slug
join public.event_schedule_slots s on s.id = a.slot_id;
alter view public.schedule_assignment_details set (security_invoker = true);

-- A team appears exactly once, using the two register numbers as its stable key.
create or replace function public.techtalks_schedule_candidates()
returns table(team_key text, member_one_register_no text, member_two_register_no text,
              member_one_name text, member_two_name text, approved boolean)
language sql security definer set search_path = public as $$
  with candidates as (
    select
      least(r.register_no, coalesce(r.event_partners->'techtalks'->>'registerNumber', r.partner_register_no)) || ':' ||
      greatest(r.register_no, coalesce(r.event_partners->'techtalks'->>'registerNumber', r.partner_register_no)) as key,
      least(r.register_no, coalesce(r.event_partners->'techtalks'->>'registerNumber', r.partner_register_no)) as one_no,
      greatest(r.register_no, coalesce(r.event_partners->'techtalks'->>'registerNumber', r.partner_register_no)) as two_no
    from public.registrations r
    where r.events @> jsonb_build_array('techtalks')
      and coalesce(r.event_partners->'techtalks'->>'registerNumber', r.partner_register_no) is not null
  )
  select c.key, c.one_no, c.two_no,
         r1.full_name, r2.full_name, coalesce(a.approved, false)
  from (select distinct key, one_no, two_no from candidates) c
  left join public.registrations r1 on r1.register_no = c.one_no
  left join public.registrations r2 on r2.register_no = c.two_no
  left join public.techtalks_team_approvals a on a.team_key = c.key
  order by c.key;
$$;
grant execute on function public.techtalks_schedule_candidates() to authenticated;

create or replace function public.set_techtalks_team_approval(p_team_key text, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_parts text[];
begin
  if not exists (select 1 from public.admin_profiles where id = auth.uid()) then
    raise exception 'Admin access is required.';
  end if;
  v_parts := string_to_array(trim(p_team_key), ':');
  if array_length(v_parts, 1) <> 2 then raise exception 'Invalid TechTalks team.'; end if;
  insert into public.techtalks_team_approvals (team_key, member_one_register_no, member_two_register_no, approved, reviewed_by, reviewed_at)
  values (p_team_key, v_parts[1], v_parts[2], p_approved, auth.uid(), now())
  on conflict (team_key) do update set approved = excluded.approved, reviewed_by = auth.uid(), reviewed_at = now();
end;
$$;
grant execute on function public.set_techtalks_team_approval(text, boolean) to authenticated;

-- Persist an automatically calculated schedule only after the database repeats
-- the essential safety checks: selected event, matching slot, capacities and
-- no overlapping rows for any participant.
create or replace function public.replace_automatic_schedule(p_assignments jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not exists (select 1 from public.admin_profiles where id = auth.uid()) then
    raise exception 'Admin access is required.';
  end if;
  if jsonb_typeof(p_assignments) <> 'array' then raise exception 'Invalid schedule data.'; end if;

  create temporary table proposed_schedule (
    registration_id uuid, event_slug text, slot_id uuid
  ) on commit drop;
  insert into proposed_schedule
  select registration_id, event_slug, slot_id
  from jsonb_to_recordset(p_assignments) as x(registration_id uuid, event_slug text, slot_id uuid);

  select count(*) into v_count from proposed_schedule;
  if v_count = 0 then raise exception 'There are no assignments to save.'; end if;
  if exists (select 1 from proposed_schedule group by registration_id, event_slug having count(*) > 1) then
    raise exception 'A participant has a duplicate event assignment.';
  end if;
  if exists (
    select 1 from proposed_schedule p join public.registrations r on r.id = p.registration_id
    where not (r.events @> jsonb_build_array(p.event_slug))
  ) then raise exception 'Schedule contains an event that was not selected.'; end if;
  if exists (
    select 1 from proposed_schedule p join public.event_schedule_slots s on s.id = p.slot_id
    where s.event_slug <> p.event_slug
  ) then raise exception 'Schedule contains an invalid event slot.'; end if;
  if exists (
    select 1
    from proposed_schedule p join public.event_schedule_slots s on s.id = p.slot_id
    group by s.id, s.participant_capacity
    having s.participant_capacity is not null and count(*) > s.participant_capacity
  ) then raise exception 'A participant capacity would be exceeded.'; end if;
  if exists (
    select 1
    from proposed_schedule p join public.event_schedule_slots s on s.id = p.slot_id
      join public.events e on e.slug = p.event_slug
    group by s.id, e.team_size, s.team_capacity
    having s.team_capacity is not null and ceil(count(*)::numeric / e.team_size) > s.team_capacity
  ) then raise exception 'A team capacity would be exceeded.'; end if;
  if exists (
    select 1 from proposed_schedule a
      join public.event_schedule_slots sa on sa.id = a.slot_id
      join proposed_schedule b on b.registration_id = a.registration_id and b.slot_id <> a.slot_id
      join public.event_schedule_slots sb on sb.id = b.slot_id
    where sa.schedule_date = sb.schedule_date and sa.start_time < sb.end_time and sb.start_time < sa.end_time
  ) then raise exception 'A participant would have overlapping events.'; end if;

  delete from public.event_schedule_assignments where assignment_source = 'automatic';
  insert into public.event_schedule_assignments (registration_id, event_slug, slot_id, assignment_source)
  select registration_id, event_slug, slot_id, 'automatic' from proposed_schedule;
  return jsonb_build_object('saved', v_count);
end;
$$;
grant execute on function public.replace_automatic_schedule(jsonb) to authenticated;
