-- Paper Trader 0008 — post-trade reviews

alter table public.trades
  add column if not exists review jsonb,
  add column if not exists review_at timestamptz;

create index if not exists idx_trades_with_review
  on public.trades(account_id, created_at desc)
  where review is not null;
