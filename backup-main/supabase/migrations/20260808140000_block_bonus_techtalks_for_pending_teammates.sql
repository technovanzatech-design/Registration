-- A bonus TechTalks slot (after 30 registrations) is only for a new team that
-- selects TechTalks alone. A reserved teammate already has one event, so they
-- must never use a bonus slot to create a second event registration.
do $$
begin
  if to_regprocedure('public.complete_partner_registration_bonus_base(jsonb)') is null then
    alter function public.complete_partner_registration(jsonb)
      rename to complete_partner_registration_bonus_base;
  end if;
end;
$$;

create or replace function public.complete_partner_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_techtalk_registrations integer;
begin
  if trim(payload->>'eventSlug') = 'techtalks' then
    select count(*) into v_techtalk_registrations
    from public.registrations
    where events @> jsonb_build_array('techtalks');

    if v_techtalk_registrations >= 30 then
      raise exception 'The regular TechTalks teams are full. Bonus TechTalks slots are only for a new team registering for TechTalks only.';
    end if;
  end if;

  return public.complete_partner_registration_bonus_base(payload);
end;
$$;

grant execute on function public.complete_partner_registration(jsonb) to anon, authenticated;
