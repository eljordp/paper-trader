import { NextResponse } from "next/server";
import { adminClient, requireOwner } from "@/lib/admin";
import {
  AI_TRADER_DISPLAY_NAME,
  AI_TRADER_EMAIL,
  AI_TRADER_SLUG,
} from "@/lib/aiTrader";
import { TIERS } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Idempotent bootstrap. Owner-only. Creates the AI Trader auth user,
// profile (slug=ai-trader, role=ai), and an elite-tier free-play account.
export async function POST() {
  await requireOwner();
  const sb = adminClient();

  let userId: string | null = null;

  // Try to find an existing auth user with this email by listing.
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email === AI_TRADER_EMAIL);
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: AI_TRADER_EMAIL,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { kind: "ai_trader" },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: `auth create failed: ${createErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    userId = created.user.id;
  }

  // Profile (the on_auth_user_created trigger seeds a basic row; patch it).
  await sb
    .from("profiles")
    .update({
      display_name: AI_TRADER_DISPLAY_NAME,
      slug: AI_TRADER_SLUG,
      roles: ["ai"],
      highest_tier_unlocked: "elite",
    })
    .eq("id", userId);

  // Account: elite tier ($250K starting), free-play (no rules)
  const cfg = TIERS.elite;
  const { data: existingAcct } = await sb
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  let accountId: string;
  if (existingAcct) {
    accountId = (existingAcct as { id: string }).id;
  } else {
    const { data: acct, error: acctErr } = await sb
      .from("accounts")
      .insert({
        user_id: userId,
        name: `${AI_TRADER_DISPLAY_NAME} — Live`,
        tier: "elite",
        starting_cash: cfg.startingCash,
        cash: cfg.startingCash,
        high_water_mark: cfg.startingCash,
      })
      .select("id")
      .single();
    if (acctErr || !acct) {
      return NextResponse.json(
        { error: `account insert failed: ${acctErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    accountId = (acct as { id: string }).id;
  }

  await sb
    .from("profiles")
    .update({ active_account_id: accountId })
    .eq("id", userId);

  return NextResponse.json({
    ok: true,
    userId,
    accountId,
    publicUrl: `/u/${AI_TRADER_SLUG}`,
  });
}
