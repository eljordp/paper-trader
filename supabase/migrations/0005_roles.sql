-- Paper Trader 0005 — user roles (admin, owner, staff, etc.)

alter table public.profiles
  add column if not exists roles text[] default '{}';

create index if not exists idx_profiles_roles on public.profiles using gin(roles);
