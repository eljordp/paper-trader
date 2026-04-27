-- Paper Trader 0002 — bracket orders (SL/TP), trade journal metadata, subscriptions

-- =============================================================================
-- positions: add stop_loss + take_profit
-- =============================================================================
alter table public.positions
  add column if not exists stop_loss numeric,
  add column if not exists take_profit numeric;

-- =============================================================================
-- trades: add triggered_by (manual, stop, target, eval_failed)
-- =============================================================================
alter table public.trades
  add column if not exists triggered_by text default 'manual'
    check (triggered_by in ('manual','stop','target','eval_failed'));

-- =============================================================================
-- subscriptions: lightweight Stripe sub tracking
-- (we also use profiles.is_pro / pro_until for fast UI checks)
-- =============================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text check (status in ('active','past_due','canceled','incomplete','trialing')),
  plan text default 'pro_monthly',
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Inserts/updates only via service role (Stripe webhook), not user-facing
