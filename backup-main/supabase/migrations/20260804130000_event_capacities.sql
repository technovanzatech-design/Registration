-- Your registrations table stores events as a jsonb array of slugs,
-- e.g. ["coding-sprint", "gaming-tournament"] — there's no separate
-- events table anywhere. This creates one to hold each event's display
-- name and capacity, keyed by the same slug strings used in that array.

create table if not exists public.events (
  slug text primary key,
  name text not null,
  capacity integer,
  created_at timestamptz not null default now()
);

comment on column public.events.capacity is
  'Max registrations allowed for this event. Null = unlimited.';

alter table public.events enable row level security;

-- Anyone can read the event list/names (needed for your public
-- registration form to show event options).
drop policy if exists "anyone can read events" on public.events;
create policy "anyone can read events"
  on public.events
  for select
  to anon, authenticated
  using (true);

-- Only admins can add/edit events (capacity, names, new events).
drop policy if exists "admins can manage events" on public.events;
create policy "admins can manage events"
  on public.events
  for all
  to authenticated
  using (
    exists (select 1 from public.admin_profiles where admin_profiles.id = auth.uid())
  )
  with check (
    exists (select 1 from public.admin_profiles where admin_profiles.id = auth.uid())
  );

-- Unnests registrations.events (jsonb array of slugs) and counts how
-- many registrations reference each slug, joined against capacity.
create or replace view public.event_capacity_status as
select
  e.slug as event_slug,
  e.name as event_name,
  e.capacity,
  count(r.id) as registered_count,
  case
    when e.capacity is null then null
    else greatest(e.capacity - count(r.id), 0)
  end as seats_remaining
from public.events e
left join public.registrations r
  on r.events @> to_jsonb(e.slug::text)
group by e.slug, e.name, e.capacity;

alter view public.event_capacity_status set (security_invoker = true);