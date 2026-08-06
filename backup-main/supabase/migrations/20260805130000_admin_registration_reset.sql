-- Use `select public.reset_registrations_for_testing();` while signed in as an admin.
create or replace function public.reset_registrations_for_testing()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admin_profiles where id = auth.uid()) then
    raise exception 'Only an admin can reset registrations.';
  end if;
  update registrations set partner_registration_id = null;
  delete from registrations;
  perform setval('registration_participant_seq', 1, false);
end;
$$;
grant execute on function public.reset_registrations_for_testing() to authenticated;
