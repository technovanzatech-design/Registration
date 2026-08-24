-- Final room allocation confirmed by the symposium coordinators.
update public.event_schedule_slots
set room = case event_slug
  when 'prompt-maestro' then 'Artificial Intelligence Lab'
  when 'webnova' then 'Artificial Intelligence Lab'
  when 'codefusion' then 'Data Science Lab'
  when 'checkmate-challenge' then 'Data Science Lab'
  when 'techtalks' then 'Conference Hall'
  else room
end
where event_slug in ('prompt-maestro', 'webnova', 'codefusion', 'checkmate-challenge', 'techtalks');
