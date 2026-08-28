-- Nexus has a single overall registration limit of 30 participants, but its
-- two timetable slots must each be able to accept a connected duo group. A
-- 16/14 split can strand a valid team when its only conflict-free slot has
-- fewer than two seats left. Each slot may therefore use the room's full
-- Nexus capacity; the registration limit on public.events still caps the
-- event at 30 participants in total.

update public.event_schedule_slots
set participant_capacity = 30,
    team_capacity = 15
where event_slug = 'nexus';
