-- Paper Trader 0013 — AI Strategy Lab

create table if not exists public.ai_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  source text not null check (source in ('discovery','generation','manual')),
  name text not null,
  hypothesis text,
  instruments text[],
  rules jsonb not null,
  backtest jsonb,
  live_stats jsonb default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed','backtested','live','paused','archived')),
  max_account_risk_pct numeric default 1.0,
  max_concurrent_positions int default 3,
  max_trades_per_day int default 5,
  auto_pause_on_consec_losses int default 3,
  paused_reason text,
  paused_at timestamptz,
  last_signal_at timestamptz,
  last_backtest_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_strategies_user on public.ai_strategies(user_id);
create index if not exists idx_ai_strategies_user_status on public.ai_strategies(user_id, status);
create index if not exists idx_ai_strategies_live on public.ai_strategies(status) where status = 'live';

alter table public.ai_strategies enable row level security;

drop policy if exists "ai_strategies_all_own" on public.ai_strategies;
create policy "ai_strategies_all_own" on public.ai_strategies
  for all using (auth.uid() = user_id);

alter table public.trades
  add column if not exists ai_strategy_id uuid references public.ai_strategies(id) on delete set null;

create index if not exists idx_trades_ai_strategy
  on public.trades(ai_strategy_id) where ai_strategy_id is not null;

create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid references public.ai_strategies(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  decision_type text not null,
  inputs jsonb,
  output jsonb,
  rationale text not null,
  outcome text,
  outcome_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_ai_decisions_user_created
  on public.ai_decisions(user_id, created_at desc);
create index if not exists idx_ai_decisions_strategy_created
  on public.ai_decisions(strategy_id, created_at desc) where strategy_id is not null;

alter table public.ai_decisions enable row level security;

drop policy if exists "ai_decisions_all_own" on public.ai_decisions;
create policy "ai_decisions_all_own" on public.ai_decisions
  for all using (auth.uid() = user_id);
