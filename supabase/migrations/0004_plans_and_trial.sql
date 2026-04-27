-- Paper Trader 0004 — multi-tier plans, 7-day free trial

-- Plans: free, pro, vip, enterprise
alter table public.profiles
  add column if not exists plan text default 'free'
    check (plan in ('free','pro','vip','enterprise')),
  add column if not exists trial_until timestamptz;

-- Backfill existing users with a 7-day trial from now (so anyone who signed up before this gets one too)
update public.profiles
  set trial_until = now() + interval '7 days'
  where trial_until is null;

-- Update handle_new_user to set trial_until on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, trial_until)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    now() + interval '7 days'
  );
  return new;
end;
$$;

-- subscriptions table needs a plan column too
alter table public.subscriptions
  add column if not exists plan text default 'pro'
    check (plan in ('pro','vip','enterprise'));
