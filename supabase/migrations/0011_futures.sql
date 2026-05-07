-- Paper Trader 0011 — futures support

alter table public.positions
  add column if not exists instrument_type text not null default 'stock'
    check (instrument_type in ('stock','futures')),
  add column if not exists margin_held numeric default 0;

alter table public.trades
  add column if not exists instrument_type text not null default 'stock'
    check (instrument_type in ('stock','futures')),
  add column if not exists contracts numeric,
  add column if not exists point_value numeric;

alter table public.pending_orders
  add column if not exists instrument_type text not null default 'stock'
    check (instrument_type in ('stock','futures'));

create index if not exists idx_positions_instrument
  on public.positions(account_id, instrument_type);
