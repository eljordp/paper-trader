-- Paper Trader v1 schema
-- Funded eval simulator: profiles, accounts (tiers), positions, trades, watchlist, equity snapshots

-- =============================================================================
-- profiles: extends auth.users
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_pro boolean default false,
  pro_until timestamptz,
  highest_tier_unlocked text default 'rookie' check (highest_tier_unlocked in ('rookie','phase1','phase2','pro','elite')),
  active_account_id uuid,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- accounts: a paper account at a specific tier
-- =============================================================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Account',
  tier text not null check (tier in ('rookie','phase1','phase2','pro','elite')),
  starting_cash numeric not null,
  cash numeric not null,
  status text not null default 'active' check (status in ('active','passed','failed')),
  failure_reason text,
  -- eval rules (FTMO style)
  profit_target_pct numeric, -- e.g. 8.0 = pass at +8%
  daily_loss_limit_pct numeric, -- e.g. 5.0 = fail if account drops -5% from yesterday close
  max_drawdown_pct numeric, -- e.g. 10.0 = fail if account drops -10% from start
  min_trading_days int, -- e.g. 5
  -- progress tracking
  high_water_mark numeric not null,
  trading_days_count int default 0,
  last_trading_date date,
  passed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_accounts_user on public.accounts(user_id);
create index if not exists idx_accounts_user_active on public.accounts(user_id) where status = 'active';

alter table public.accounts enable row level security;

create policy "accounts_select_own" on public.accounts
  for select using (auth.uid() = user_id);

create policy "accounts_insert_own" on public.accounts
  for insert with check (auth.uid() = user_id);

create policy "accounts_update_own" on public.accounts
  for update using (auth.uid() = user_id);

create policy "accounts_delete_own" on public.accounts
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- positions: open positions per account
-- =============================================================================
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  ticker text not null,
  shares numeric not null check (shares > 0),
  avg_cost numeric not null check (avg_cost > 0),
  opened_at timestamptz default now(),
  unique(account_id, ticker)
);

create index if not exists idx_positions_account on public.positions(account_id);

alter table public.positions enable row level security;

create policy "positions_all_own_account" on public.positions
  for all using (
    exists(select 1 from public.accounts a where a.id = positions.account_id and a.user_id = auth.uid())
  );

-- =============================================================================
-- trades: trade history per account
-- =============================================================================
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  ticker text not null,
  side text not null check (side in ('buy','sell')),
  shares numeric not null check (shares > 0),
  price numeric not null check (price > 0),
  total numeric not null,
  realized_pnl numeric,
  notes text,
  tags text[],
  created_at timestamptz default now()
);

create index if not exists idx_trades_account_created on public.trades(account_id, created_at desc);

alter table public.trades enable row level security;

create policy "trades_all_own_account" on public.trades
  for all using (
    exists(select 1 from public.accounts a where a.id = trades.account_id and a.user_id = auth.uid())
  );

-- =============================================================================
-- watchlist: tickers user is watching (per-user, not per-account)
-- =============================================================================
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  created_at timestamptz default now(),
  unique(user_id, ticker)
);

create index if not exists idx_watchlist_user on public.watchlist(user_id);

alter table public.watchlist enable row level security;

create policy "watchlist_all_own" on public.watchlist
  for all using (auth.uid() = user_id);

-- =============================================================================
-- equity_snapshots: daily snapshot for equity curve chart
-- =============================================================================
create table if not exists public.equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  equity numeric not null,
  cash numeric not null,
  positions_value numeric not null,
  recorded_at timestamptz default now()
);

create index if not exists idx_equity_account_recorded on public.equity_snapshots(account_id, recorded_at desc);

alter table public.equity_snapshots enable row level security;

create policy "equity_snapshots_all_own_account" on public.equity_snapshots
  for all using (
    exists(select 1 from public.accounts a where a.id = equity_snapshots.account_id and a.user_id = auth.uid())
  );
