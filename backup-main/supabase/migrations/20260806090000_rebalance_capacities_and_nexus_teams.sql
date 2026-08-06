update public.events set capacity = 50, team_size = 2 where slug = 'fun-feast';
update public.events set capacity = 20, team_size = 1 where slug in ('brain-battle', 'checkmate-challenge');
update public.events set capacity = 30, team_size = 2 where slug = 'nexus';
