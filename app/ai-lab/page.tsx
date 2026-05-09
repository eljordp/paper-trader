import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AILabClient from "./ai-lab-client";

export const dynamic = "force-dynamic";

export default async function AILabPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: strategies } = await sb.from("ai_strategies").select("*").eq("user_id", user.id).neq("status", "archived").order("created_at", { ascending: false });
  const { data: decisions } = await sb.from("ai_decisions").select("id, decision_type, rationale, created_at, strategy_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);

  return <AILabClient strategies={(strategies ?? []) as never[]} decisions={(decisions ?? []) as never[]} />;
}
