"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireUser() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { sb, user };
}

export async function updateTradingPreferences(input: {
  cooldownMinutes: number | null;
  defaultRiskPct: number | null;
}) {
  const { sb, user } = await requireUser();
  const cooldown =
    input.cooldownMinutes == null
      ? null
      : Math.max(0, Math.min(120, Math.floor(input.cooldownMinutes)));
  const risk =
    input.defaultRiskPct == null
      ? null
      : Math.max(0.1, Math.min(10, Number(input.defaultRiskPct)));
  const { error } = await sb
    .from("profiles")
    .update({ cooldown_minutes: cooldown, default_risk_pct: risk })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function signOutAllSessions() {
  const { user } = await requireUser();
  const sb = adminClient();
  // Revokes refresh tokens for every session of this user.
  await sb.auth.admin.signOut(user.id, "global").catch(() => {});
  redirect("/login");
}

export async function deleteMyAccount() {
  const { user } = await requireUser();
  const sb = adminClient();
  // ON DELETE CASCADE on profiles.id → auth.users handles the bulk; explicitly
  // remove the auth user (which cascades into profiles, accounts, trades, etc).
  await sb.auth.admin.deleteUser(user.id).catch(() => {});
  redirect("/login");
}
