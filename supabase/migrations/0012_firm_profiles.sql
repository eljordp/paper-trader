-- Paper Trader 0012 — firm-specific eval profiles (FTMO, Apex, Topstep, MFFU)

alter table public.accounts
  add column if not exists firm_profile text,
  add column if not exists drawdown_type text default 'static'
    check (drawdown_type in ('static','trailing')),
  add column if not exists consistency_rule_pct numeric,
  add column if not exists no_overnight boolean default false,
  add column if not exists profit_target_dollars numeric,
  add column if not exists daily_loss_limit_dollars numeric,
  add column if not exists max_drawdown_dollars numeric,
  add column if not exists trailing_dd_lock_at_dollars numeric;

create index if not exists idx_accounts_firm on public.accounts(firm_profile)
  where firm_profile is not null;
