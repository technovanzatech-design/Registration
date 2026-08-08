-- The five bonus TechTalks teams are complete after one registration, but the
-- teammate must still be returned to the browser so their entry card and
-- confirmation email are generated immediately.
-- Keep the existing registration rules in the original function and wrap only
-- the bonus-Team response shape.
do $$
begin
  -- On a re-run the base function already exists, so do not try to rename it
  -- a second time. The CREATE OR REPLACE below will safely refresh the wrapper.
  if to_regprocedure('public.submit_registration_bonus_base(jsonb)') is null then
    alter function public.submit_registration(jsonb)
      rename to submit_registration_bonus_base;
  end if;
end;
$$;

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_registration registrations%rowtype;
  v_partner registrations%rowtype;
  v_partner_data jsonb;
begin
  v_result := public.submit_registration_bonus_base(payload);

  -- Only the post-30-seat TechTalks-only path needs this correction. The
  -- ordinary one-technical/one-non-technical path already returns teammates.
  if jsonb_array_length(payload->'events') = 1
     and payload->'events'->>0 = 'techtalks' then
    select * into v_registration
      from public.registrations
      where id = (v_result->>'registration_id')::uuid;

    v_partner_data := v_registration.event_partners->'techtalks';
    if v_partner_data is not null then
      select * into v_partner
        from public.registrations
        where register_no = v_partner_data->>'registerNumber'
        limit 1;

      if found then
        v_result := v_result || jsonb_build_object(
          'pending_teammates',
          jsonb_build_array(jsonb_build_object(
            'id', v_partner.participant_id,
            'fullName', v_partner.full_name,
            'registerNumber', v_partner.register_no,
            'collegeName', v_partner.college_name,
            'email', v_partner.email,
            'phone', v_partner.phone,
            'events', v_partner.events,
            'partnerFullName', v_registration.full_name,
            'createdAt', v_partner.created_at
          ))
        );
      end if;
    end if;
  end if;

  return v_result;
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon, authenticated;
