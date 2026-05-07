-- Paper Trader 0010 — limit and stop entry orders

create table if not exists public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  side text not null check (side in ('buy','sell','short','cover')),
  order_type text not null check (order_type in ('limit','stop')),
  qty numeric not null check (qty > 0),
  limit_price numeric,
  stop_price numeric,
  stop_loss numeric,
  take_profit numeric,
  strategy_id uuid references public.strategies(id) on delete set null,
  is_training boolean default false,
  notes text,
  status text not null default 'open' check (status in ('open','filled','canceled','expired','rejected')),
  filled_trade_id uuid references public.trades(id) on delete set null,
  fill_price numeric,
  rejection_reason text,
  expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz default now(),
  filled_at timestamptz,
  canceled_at timestamptz
);

create index if not exists idx_pending_orders_account_status
  on public.pending_orders(account_id, status);
create index if not exists idx_pending_orders_open_ticker
  on public.pending_orders(ticker, status)
  where status = 'open';

alter table public.pending_orders enable row level security;

drop policy if exists "pending_orders_all_own" on public.pending_orders;
create policy "pending_orders_all_own" on public.pending_orders
  for all using (auth.uid() = user_id);
