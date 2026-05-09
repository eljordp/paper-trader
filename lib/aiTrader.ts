import { adminClient } from "@/lib/admin";

export const AI_TRADER_SLUG = "ai-trader";
export const AI_TRADER_EMAIL = "ai-trader@paper-trader.local";
export const AI_TRADER_DISPLAY_NAME = "AI Trader";

export type AiTraderProfile = {
  id: string;
  display_name: string | null;
  active_account_id: string | null;
  slug: string | null;
};

export async function getAiTraderProfile(): Promise<AiTraderProfile | null> {
  const sb = adminClient();
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, active_account_id, slug")
    .eq("slug", AI_TRADER_SLUG)
    .maybeSingle();
  return (data as AiTraderProfile | null) ?? null;
}

export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}
