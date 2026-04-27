export function money(n: number, opts: { sign?: boolean; cents?: boolean } = {}) {
  const { sign = false, cents = true } = opts;
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const big = abs >= 10000 && !cents;
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : (big ? 0 : 2),
  });
  const prefix = n < 0 ? "-$" : sign ? "+$" : "$";
  return `${prefix}${formatted}`;
}

export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

export function pct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function shares(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function pnlColor(n: number): string {
  if (n > 0) return "text-[var(--color-up)]";
  if (n < 0) return "text-[var(--color-down)]";
  return "text-[var(--color-text-dim)]";
}
