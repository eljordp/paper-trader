-- Paper Trader 0003 — discipline tools (cooldown), daily challenges, user settings

-- =============================================================================
-- accounts: cooldown_until for stop-out cooling off
-- =============================================================================
alter table public.accounts
  add column if not exists cooldown_until timestamptz;

-- =============================================================================
-- profiles: user trading settings
-- =============================================================================
alter table public.profiles
  add column if not exists default_risk_pct numeric default 1.0,
  add column if not exists cooldown_minutes int default 15;

-- =============================================================================
-- daily_challenges: one per user per day
-- =============================================================================
create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  challenge_type text not null,
  challenge_data jsonb,
  completed boolean default false,
  completed_at timestamptz,
  failed boolean default false,
  failed_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, challenge_date)
);

create index if not exists idx_daily_challenges_user_date
  on public.daily_challenges(user_id, challenge_date desc);

alter table public.daily_challenges enable row level security;

create policy "daily_challenges_all_own" on public.daily_challenges
  for all using (auth.uid() = user_id);
