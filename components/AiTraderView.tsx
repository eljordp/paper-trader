import { adminClient } from "@/lib/admin";
import { TIERS, type Tier } from "@/lib/tiers";
import { money, pct } from "@/lib/format";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { ArrowLeft, Activity, Brain, Sparkles, AlertTriangle } from "lucide-react";
import Avatar from "@/components/Avatar";
import AiNav from "@/components/AiNav";
import { getAiProfileConfig } from "@/lib/aiTrader";
import { computeAccountEquity } from "@/lib/equity";

type Strategy = {
  id: string;
  name: string;
  hypothesis: string | null;
  instruments: string[];
  status: string;
  max_account_risk_pct: number | null;
  last_signal_at: string | null;
  created_at: string;
};

type Decision = {
  id: string;
  decision_type: string;
  rationale: string;
  created_at: string;
};

type Trade = {
  id: string;
  ticker: string;
  side: string;
  shares: number;
  price: number;
  realized_pnl: number | null;
  triggered_by: string | null;
  notes: string | null;
  created_at: string;
};

type Position = {
  id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  side: string;
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string;
};

export default async function AiTraderView({ slug }: { slug: string }) {
  const config = getAiProfileConfig(slug);
  if (!config) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-serif text-4xl">Unknown AI</h1>
        <p className="text-[var(--color-text-dim)]">
          No AI profile configured for slug <code>{slug}</code>.
        </p>
      </div>
    );
  }

  const sb = adminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("id, display_name, avatar_url, active_account_id, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="max-w-[1100px] mx-auto px-6 py-20 space-y-10">
        <AiNav currentSlug={slug} />
        <div className="text-center space-y-4">
          <h1 className="font-serif text-4xl">{config.displayName}</h1>
          <p className="text-[var(--color-text-dim)] max-w-xl mx-auto">
            Not initialized yet. Owner must POST to{" "}
            <code className="text-xs bg-[var(--color-surface)] px-2 py-1 rounded">
              /api/admin/init-ai-trader
            </code>{" "}
            to seed all AI accounts.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
          >
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
        </div>
      </div>
    );
  }

  const p = profile as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    active_account_id: string | null;
    created_at: string;
  };

  const accountId = p.active_account_id;
  const [accountRes, strategiesRes, decisionsRes, tradesRes, positionsRes] =
    await Promise.all([
      accountId
        ? sb
            .from("accounts")
            .select(
              "id, tier, starting_cash, cash, status, created_at",
            )
            .eq("id", accountId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        .from("ai_strategies")
        .select(
          "id, name, hypothesis, instruments, status, max_account_risk_pct, last_signal_at, created_at",
        )
        .eq("user_id", p.id)
        .in("status", ["live", "proposed", "paused"])
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("ai_decisions")
        .select("id, decision_type, rationale, created_at")
        .eq("user_id", p.id)
        .order("created_at", { ascending: false })
        .limit(40),
      accountId
        ? sb
            .from("trades")
            .select(
              "id, ticker, side, shares, price, realized_pnl, triggered_by, notes, created_at",
            )
            .eq("account_id", accountId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
      accountId
        ? sb
            .from("positions")
            .select(
              "id, ticker, shares, avg_cost, side, stop_loss, take_profit, opened_at",
            )
            .eq("account_id", accountId)
            .order("opened_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  const account = accountRes.data as {
    id: string;
    tier: Tier;
    starting_cash: number;
    cash: number;
    status: string;
    created_at: string;
  } | null;
  const strategies = (strategiesRes.data ?? []) as Strategy[];
  const decisions = (decisionsRes.data ?? []) as Decision[];
  const trades = (tradesRes.data ?? []) as Trade[];
  const positions = (positionsRes.data ?? []) as Position[];

  const closedTrades = trades.filter((t) => t.realized_pnl != null);
  const wins = closedTrades.filter((t) => Number(t.realized_pnl) > 0);
  const winRate =
    closedTrades.length > 0 ? wins.length / closedTrades.length : null;
  const totalRealized = closedTrades.reduce(
    (a, t) => a + Number(t.realized_pnl ?? 0),
    0,
  );

  const liveStrategies = strategies.filter((s) => s.status === "live");
  // Marked-to-market equity: cash + value of every open position. Without
  // this the dashboard reports -28% return on AI SPY when its cash is tied
  // up in an open SPY position that's roughly at entry. Falls back to cash-
  // only if the equity helper can't fetch quotes (e.g., yahoo timeout).
  const equityData = account ? await computeAccountEquity(sb, account.id) : null;
  const equity = equityData?.equity ?? (account ? Number(account.cash) : 0);
  const returnPct = equityData
    ? equityData.returnPct
    : account
      ? ((Number(account.cash) - Number(account.starting_cash)) /
          Number(account.starting_cash)) *
        100
      : 0;

  const memberSince = format(new Date(p.created_at), "MMM yyyy");
  const displayName = config.displayName;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)]"
      >
        <ArrowLeft className="w-3 h-3" /> Home
      </Link>

      <AiNav currentSlug={slug} />

      {/* HEADER */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-5">
            <Avatar name={displayName} src={p.avatar_url} size={96} ring />
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium bg-[var(--color-cyan)]/10 text-[var(--color-cyan)] border border-[var(--color-cyan)]/40 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Autonomous AI
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium bg-[var(--color-up)]/10 text-[var(--color-up)] border border-[var(--color-up)]/40 inline-flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Live
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]">
                  {config.brainStyle.replace(/_/g, " ")}
                </span>
              </div>
              <h1 className="font-serif text-6xl tracking-tight leading-none">
                {displayName}
              </h1>
              <div className="text-sm text-[var(--color-text-dim)] max-w-2xl leading-relaxed">
                {config.fullDescription}
              </div>
              <div className="text-xs text-[var(--color-text-faint)]">
                Trading since {memberSince} · {config.defaultRiskPct}% risk per
                trade · max {config.maxTradesPerDay} trades/day ·{" "}
                {config.maxConcurrentPositions} concurrent positions
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* STATS */}
      {account && (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[var(--color-border)] border border-[var(--color-border)] rounded-lg overflow-hidden">
          <Stat
            label="Account"
            value={`$${(Number(account.starting_cash) / 1000).toFixed(0)}K`}
            sub={TIERS[account.tier].name}
          />
          <Stat
            label="Equity"
            value={money(equity, { cents: false })}
            sub={`${money(Number(account.cash), { cents: false })} cash`}
          />
          <Stat
            label="Return"
            value={pct(returnPct)}
            valueClass={
              returnPct > 0
                ? "text-[var(--color-up)]"
                : returnPct < 0
                  ? "text-[var(--color-down)]"
                  : ""
            }
          />
          <Stat
            label="Trades"
            value={String(trades.length)}
            sub={`${wins.length}W / ${closedTrades.length - wins.length}L`}
          />
          <Stat
            label="Win rate"
            value={winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
            sub={
              totalRealized !== 0
                ? `${totalRealized >= 0 ? "+" : ""}${money(totalRealized, { cents: false })}`
                : undefined
            }
            valueClass={
              winRate != null && winRate >= 0.5
                ? "text-[var(--color-up)]"
                : winRate != null
                  ? "text-[var(--color-down)]"
                  : ""
            }
          />
        </section>
      )}

      {/* OPEN POSITIONS */}
      {positions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--color-up)]" />
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              Open positions
            </div>
          </div>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 items-center text-sm"
              >
                <div className="font-mono">
                  {pos.ticker}
                  <span
                    className={`ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      pos.side === "long"
                        ? "bg-[var(--color-up)]/10 text-[var(--color-up)]"
                        : "bg-[var(--color-down)]/10 text-[var(--color-down)]"
                    }`}
                  >
                    {pos.side}
                  </span>
                </div>
                <div className="font-mono text-[var(--color-text-dim)]">
                  {pos.shares} @ ${Number(pos.avg_cost).toFixed(2)}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  Stop:{" "}
                  {pos.stop_loss != null
                    ? `$${Number(pos.stop_loss).toFixed(2)}`
                    : "—"}
                </div>
                <div className="text-xs text-[var(--color-text-dim)]">
                  Target:{" "}
                  {pos.take_profit != null
                    ? `$${Number(pos.take_profit).toFixed(2)}`
                    : "—"}
                </div>
                <div className="text-xs text-right text-[var(--color-text-faint)]">
                  Opened{" "}
                  {formatDistanceToNow(new Date(pos.opened_at), {
                    addSuffix: true,
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ACTIVE STRATEGIES */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[var(--color-cyan)]" />
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Active strategies ({liveStrategies.length} live)
          </div>
        </div>
        {strategies.length === 0 ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-sm text-[var(--color-text-dim)] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--color-text-faint)]" />
            No strategies yet. The morning research cycle will generate them.
          </div>
        ) : (
          <div className="space-y-2">
            {strategies.slice(0, 8).map((s) => (
              <div
                key={s.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        s.status === "live"
                          ? "bg-[var(--color-up)]/10 text-[var(--color-up)] border border-[var(--color-up)]/30"
                          : s.status === "paused"
                            ? "bg-[var(--color-down)]/10 text-[var(--color-down)] border border-[var(--color-down)]/30"
                            : "bg-[var(--color-text-faint)]/10 text-[var(--color-text-faint)] border border-[var(--color-text-faint)]/30"
                      }`}
                    >
                      {s.status}
                    </span>
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className="font-mono text-xs text-[var(--color-text-dim)]">
                      {s.instruments.join(", ")}
                    </span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                    {formatDistanceToNow(new Date(s.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
                {s.hypothesis && (
                  <div className="text-sm text-[var(--color-text-dim)]">
                    {s.hypothesis}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* DECISION LOG */}
      <section className="space-y-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Decision log
        </div>
        {decisions.length === 0 ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-sm text-[var(--color-text-dim)]">
            No decisions yet.
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden divide-y divide-[var(--color-border)]">
            {decisions.slice(0, 20).map((d) => (
              <div key={d.id} className="px-5 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] font-medium">
                    {d.decision_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-faint)]">
                    {formatDistanceToNow(new Date(d.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="text-sm text-[var(--color-text-dim)] leading-relaxed">
                  {d.rationale}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* RECENT TRADES */}
      <section className="space-y-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Recent trades
        </div>
        {trades.length === 0 ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-sm text-[var(--color-text-dim)]">
            No trades yet.
          </div>
        ) : (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[80px_1fr_80px_1fr_1fr_1fr] gap-4 px-5 py-2 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <div>Time</div>
              <div>Ticker</div>
              <div>Side</div>
              <div className="text-right">Qty × Price</div>
              <div className="text-right">P&amp;L</div>
              <div>Trigger</div>
            </div>
            {trades.slice(0, 25).map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[80px_1fr_80px_1fr_1fr_1fr] gap-4 px-5 py-2 border-b border-[var(--color-border)] last:border-b-0 items-center text-sm"
              >
                <div className="text-xs text-[var(--color-text-faint)]">
                  {formatDistanceToNow(new Date(t.created_at), {
                    addSuffix: true,
                  })}
                </div>
                <div className="font-mono">{t.ticker}</div>
                <div className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
                  {t.side}
                </div>
                <div className="text-right font-mono text-xs text-[var(--color-text-dim)]">
                  {t.shares} × ${Number(t.price).toFixed(2)}
                </div>
                <div
                  className={`text-right font-mono text-xs ${
                    t.realized_pnl == null
                      ? "text-[var(--color-text-faint)]"
                      : Number(t.realized_pnl) > 0
                        ? "text-[var(--color-up)]"
                        : Number(t.realized_pnl) < 0
                          ? "text-[var(--color-down)]"
                          : "text-[var(--color-text-dim)]"
                  }`}
                >
                  {t.realized_pnl != null
                    ? `${Number(t.realized_pnl) >= 0 ? "+" : ""}$${Number(t.realized_pnl).toFixed(2)}`
                    : "—"}
                </div>
                <div className="text-xs text-[var(--color-text-faint)]">
                  {t.triggered_by ?? "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* approx equity for mobile */}
      {equity ? null : null}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] p-5 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className={`text-xl font-mono tnum ${valueClass ?? ""}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-[var(--color-text-faint)]">{sub}</div>
      )}
    </div>
  );
}
