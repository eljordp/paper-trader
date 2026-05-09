-- Paper Trader 0014 — AI Trader (always-on autonomous account)

-- Friendly slug for /u/<slug> URLs (e.g. /u/ai-trader)
alter table public.profiles
  add column if not exists slug text unique;

-- Public-read policy: anyone (logged in or not) can SELECT a profile that has
-- the 'ai' role. Same for that profile's accounts/positions/trades/strategies/
-- decisions/equity_snapshots. Owner-write is unchanged.
create or replace function public.is_ai_profile(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and 'ai' = any(p.roles)
  );
$$;

drop policy if exists "profiles_select_public_ai" on public.profiles;
create policy "profiles_select_public_ai" on public.profiles
  for select
  using ('ai' = any(coalesce(roles, '{}')));

drop policy if exists "accounts_select_public_ai" on public.accounts;
create policy "accounts_select_public_ai" on public.accounts
  for select using (public.is_ai_profile(user_id));

drop policy if exists "positions_select_public_ai" on public.positions;
create policy "positions_select_public_ai" on public.positions
  for select using (
    exists (select 1 from public.accounts a
            where a.id = positions.account_id
              and public.is_ai_profile(a.user_id))
  );

drop policy if exists "trades_select_public_ai" on public.trades;
create policy "trades_select_public_ai" on public.trades
  for select using (
    exists (select 1 from public.accounts a
            where a.id = trades.account_id
              and public.is_ai_profile(a.user_id))
  );

drop policy if exists "ai_strategies_select_public_ai" on public.ai_strategies;
create policy "ai_strategies_select_public_ai" on public.ai_strategies
  for select using (public.is_ai_profile(user_id));

drop policy if exists "ai_decisions_select_public_ai" on public.ai_decisions;
create policy "ai_decisions_select_public_ai" on public.ai_decisions
  for select using (public.is_ai_profile(user_id));

drop policy if exists "equity_snapshots_select_public_ai" on public.equity_snapshots;
create policy "equity_snapshots_select_public_ai" on public.equity_snapshots
  for select using (
    exists (select 1 from public.accounts a
            where a.id = equity_snapshots.account_id
              and public.is_ai_profile(a.user_id))
  );

grant select on public.profiles to anon;
grant select on public.accounts to anon;
grant select on public.positions to anon;
grant select on public.trades to anon;
grant select on public.ai_strategies to anon;
grant select on public.ai_decisions to anon;
grant select on public.equity_snapshots to anon;
