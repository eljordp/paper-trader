-- Paper Trader 0009 — short selling

-- Trade sides: add 'short' (open short) and 'cover' (close short)
alter table public.trades drop constraint if exists trades_side_check;
alter table public.trades
  add constraint trades_side_check check (side in ('buy','sell','short','cover'));

-- Position direction: long or short
alter table public.positions
  add column if not exists side text not null default 'long'
    check (side in ('long','short'));

create index if not exists idx_positions_account_side on public.positions(account_id, side);
