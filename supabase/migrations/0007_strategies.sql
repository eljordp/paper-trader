-- Paper Trader 0007 — strategies + training mode

create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  entry_rules text,
  exit_rules text,
  size_rules text,
  time_window text,
  instruments text[],
  is_active boolean default true,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_strategies_user on public.strategies(user_id);
create index if not exists idx_strategies_user_active on public.strategies(user_id) where is_active = true;

alter table public.strategies enable row level security;

drop policy if exists "strategies_all_own" on public.strategies;
create policy "strategies_all_own" on public.strategies
  for all using (auth.uid() = user_id);

-- Tag trades to a strategy + flag training mode (small position size practice)
alter table public.trades
  add column if not exists strategy_id uuid references public.strategies(id) on delete set null,
  add column if not exists is_training boolean default false;

create index if not exists idx_trades_strategy
  on public.trades(strategy_id)
  where strategy_id is not null;
