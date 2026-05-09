import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
import { isCronAuthorized } from "@/lib/aiTrader";
import { TIERS } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One-shot helper for UI/UX audits. Auth'd by CRON_SECRET (Bearer header).
// Creates or upserts a fully-perked customer test user, then returns a
// magic-link URL the caller can visit to be logged in as them.
//
// To remove, just delete this file.
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "audit-customer@paper-trader.local").toLowerCase();
  const displayName = url.searchParams.get("name") ?? "Audit Customer";

  const sb = adminClient();

  // Ensure user exists
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email === email);
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error } = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { kind: "audit_user" },
    });
    if (error || !created.user) {
      return NextResponse.json({ error: error?.message ?? "createUser failed" }, { status: 500 });
    }
    userId = created.user.id;
  }

  // Patch profile to fully-perked customer (NOT owner/admin — pure customer view)
  await sb
    .from("profiles")
    .update({
      display_name: displayName,
      plan: "vip",
      highest_tier_unlocked: "elite",
      pro_until: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_pro: true,
      roles: ["beta"],
    })
    .eq("id", userId);

  // Make sure they have at least one account at every tier so the dashboard
  // looks lived-in.
  const { data: existingAccts } = await sb
    .from("accounts")
    .select("tier")
    .eq("user_id", userId);
  const haveTiers = new Set(((existingAccts ?? []) as Array<{ tier: string }>).map((a) => a.tier));
  const tiersToCreate: Array<keyof typeof TIERS> = ["rookie", "phase1", "phase2", "pro", "elite"];
  let firstAccountId: string | null = null;
  for (const tier of tiersToCreate) {
    if (haveTiers.has(tier)) continue;
    const cfg = TIERS[tier];
    const { data: acct } = await sb
      .from("accounts")
      .insert({
        user_id: userId,
        name: cfg.name,
        tier,
        starting_cash: cfg.startingCash,
        cash: cfg.startingCash,
        high_water_mark: cfg.startingCash,
        profit_target_pct: cfg.rules?.profitTargetPct ?? null,
        daily_loss_limit_pct: cfg.rules?.dailyLossLimitPct ?? null,
        max_drawdown_pct: cfg.rules?.maxDrawdownPct ?? null,
        min_trading_days: cfg.rules?.minTradingDays ?? null,
      })
      .select("id")
      .single();
    if (acct && !firstAccountId) firstAccountId = (acct as { id: string }).id;
  }

  // Pick the elite account as active so dashboard shows free-play tier
  const { data: eliteAcct } = await sb
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("tier", "elite")
    .maybeSingle();
  const activeId = (eliteAcct as { id: string } | null)?.id ?? firstAccountId;
  if (activeId) {
    await sb.from("profiles").update({ active_account_id: activeId }).eq("id", userId);
  }

  // Generate magic-link
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://paper-trader-two-eta.vercel.app";
  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/` },
  });
  if (linkErr || !link.properties) {
    return NextResponse.json(
      { error: linkErr?.message ?? "generateLink failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId,
    email,
    activeAccountId: activeId,
    actionLink: link.properties.action_link,
    hashedToken: link.properties.hashed_token,
  });
}
