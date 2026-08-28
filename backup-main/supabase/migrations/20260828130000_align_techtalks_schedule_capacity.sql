-- TechTalks is now capped at 26 participants / 13 teams overall. Either
-- schedule slot must be able to hold seven teams, otherwise linked duo teams
-- can be blocked despite a valid timetable existing. The event table remains
-- the source of truth for the 13-team overall registration limit.

update public.event_schedule_slots
set participant_capacity = 14,
    team_capacity = 7
where event_slug = 'techtalks';
