-- Food-token automation. This is separate from event registration and never
-- changes a participant's registration or attendance record.
create table if not exists public.food_tokens (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  token text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  card_path text,
  card_issued_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.food_token_email_log (
  id uuid primary key default gen_random_uuid(),
  food_token_id uuid not null references public.food_tokens(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_tokens_claimed_at_idx on public.food_tokens(claimed_at);
create index if not exists food_token_email_log_token_created_idx on public.food_token_email_log(food_token_id, created_at desc);

alter table public.food_tokens enable row level security;
alter table public.food_token_email_log enable row level security;

drop policy if exists "admins manage food tokens" on public.food_tokens;
create policy "admins manage food tokens" on public.food_tokens for all to authenticated
using (exists (select 1 from public.admin_profiles a where a.id = auth.uid()))
with check (exists (select 1 from public.admin_profiles a where a.id = auth.uid()));

drop policy if exists "admins read food token email logs" on public.food_token_email_log;
create policy "admins read food token email logs" on public.food_token_email_log for select to authenticated
using (exists (select 1 from public.admin_profiles a where a.id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('food-token-cards', 'food-token-cards', true)
on conflict (id) do update set public = true;

drop policy if exists "admins manage food token cards" on storage.objects;
create policy "admins manage food token cards" on storage.objects for all to authenticated
using (
  bucket_id = 'food-token-cards'
  and exists (select 1 from public.admin_profiles a where a.id = auth.uid())
)
with check (
  bucket_id = 'food-token-cards'
  and exists (select 1 from public.admin_profiles a where a.id = auth.uid())
);

create or replace function public.provision_food_tokens()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_created integer;
begin
  if not exists (select 1 from public.admin_profiles where id = auth.uid()) then
    raise exception 'Admin access is required.';
  end if;

  insert into public.food_tokens (registration_id, token, full_name, email, phone)
  select r.id,
         'FOOD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
         r.full_name,
         lower(r.email),
         r.phone
  from public.registrations r
  where r.status = 'complete'
    and coalesce(trim(r.email), '') <> ''
  on conflict (registration_id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

create or replace function public.claim_food_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_token public.food_tokens%rowtype;
begin
  if not exists (select 1 from public.admin_profiles where id = auth.uid()) then
    raise exception 'Admin access is required.';
  end if;

  update public.food_tokens
  set claimed_at = now(), claimed_by = auth.uid()
  where token = upper(trim(p_token)) and claimed_at is null
  returning * into v_token;

  if found then
    return jsonb_build_object('result', 'claimed', 'full_name', v_token.full_name, 'email', v_token.email, 'claimed_at', v_token.claimed_at);
  end if;

  select * into v_token from public.food_tokens where token = upper(trim(p_token));
  if found then
    return jsonb_build_object('result', 'already_claimed', 'full_name', v_token.full_name, 'email', v_token.email, 'claimed_at', v_token.claimed_at);
  end if;

  return jsonb_build_object('result', 'invalid');
end;
$$;

grant execute on function public.provision_food_tokens() to authenticated;
grant execute on function public.claim_food_token(text) to authenticated;