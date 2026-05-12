import { NextResponse } from "next/server";
import { adminClient, requireOwner } from "@/lib/admin";
import { AI_PROFILES, type AiProfileConfig } from "@/lib/aiTrader";
import { TIERS } from "@/lib/tiers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BootstrapResult = {
  slug: string;
  displayName: string;
  userId: string | null;
  accountId: string | null;
  publicUrl: string;
  created: { authUser: boolean; account: boolean };
  error?: string;
};

async function bootstrapProfile(
  config: AiProfileConfig,
  authUsers: Array<{ id: string; email?: string | null }>,
): Promise<BootstrapResult> {
  const sb = adminClient();
  const result: BootstrapResult = {
    slug: config.slug,
    displayName: config.displayName,
    userId: null,
    accountId: null,
    publicUrl: `/u/${config.slug}`,
    created: { authUser: false, account: false },
  };

  // Find or create the auth user for this AI
  const existing = authUsers.find((u) => u.email === config.email);
  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: config.email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { kind: "ai_trader", brain_style: config.brainStyle },
    });
    if (createErr || !created.user) {
      result.error = `auth create failed: ${createErr?.message ?? "unknown"}`;
      return result;
    }
    userId = created.user.id;
    result.created.authUser = true;
  }
  result.userId = userId;

  // Patch the profile row (the auth trigger created a basic one)
  await sb
    .from("profiles")
    .update({
      display_name: config.displayName,
      slug: config.slug,
      roles: ["ai"],
      highest_tier_unlocked: config.tier,
    })
    .eq("id", userId);

  // Account at the configured tier + starting cash. Re-use if one exists.
  const tierCfg = TIERS[config.tier];
  const { data: existingAcct } = await sb
    .from("accounts")
    .select("id, starting_cash")
    .eq("user_id", userId)
    .maybeSingle();

  let accountId: string;
  if (existingAcct) {
    accountId = (existingAcct as { id: string }).id;
  } else {
    const startingCash = config.startingCash || tierCfg.startingCash;
    const { data: acct, error: acctErr } = await sb
      .from("accounts")
      .insert({
        user_id: userId,
        name: `${config.displayName} — Live`,
        tier: config.tier,
        starting_cash: startingCash,
        cash: startingCash,
        high_water_mark: startingCash,
      })
      .select("id")
      .single();
    if (acctErr || !acct) {
      result.error = `account insert failed: ${acctErr?.message ?? "unknown"}`;
      return result;
    }
    accountId = (acct as { id: string }).id;
    result.created.account = true;
  }
  result.accountId = accountId;

  await sb
    .from("profiles")
    .update({ active_account_id: accountId })
    .eq("id", userId);

  return result;
}

// Idempotent bootstrap for ALL AI profiles in the roster. Owner-only.
// Creates any missing auth users, patches their profile rows, and ensures
// each has an active account at the configured tier + starting cash.
export async function POST() {
  await requireOwner();
  const sb = adminClient();

  // List auth users once and reuse across all profiles to save API calls.
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const authUsers = (list?.users ?? []) as Array<{ id: string; email?: string | null }>;

  const results: BootstrapResult[] = [];
  for (const config of AI_PROFILES) {
    try {
      results.push(await bootstrapProfile(config, authUsers));
    } catch (e) {
      results.push({
        slug: config.slug,
        displayName: config.displayName,
        userId: null,
        accountId: null,
        publicUrl: `/u/${config.slug}`,
        created: { authUser: false, account: false },
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
