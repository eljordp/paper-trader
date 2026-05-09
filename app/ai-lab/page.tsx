import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AILabClient from "./ai-lab-client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Strategy Lab — Paper Trader",
  description:
    "AI generates hypotheses, backtests them, and trades the winners on your paper account. Every move logged with rationale.",
  openGraph: {
    title: "AI finds your edge — Paper Trader",
    description:
      "AI generates hypotheses, backtests them, trades the winners. Every move logged with rationale.",
    images: [
      {
        url: "/variants/og-c-aibrain.png",
        width: 1200,
        height: 630,
        alt: "Paper Trader AI Lab",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI finds your edge — Paper Trader",
    description: "AI generates hypotheses, backtests them, trades the winners.",
    images: ["/variants/og-c-aibrain.png"],
  },
};

export default async function AILabPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: strategies } = await sb.from("ai_strategies").select("*").eq("user_id", user.id).neq("status", "archived").order("created_at", { ascending: false });
  const { data: decisions } = await sb.from("ai_decisions").select("id, decision_type, rationale, created_at, strategy_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);

  return <AILabClient strategies={(strategies ?? []) as never[]} decisions={(decisions ?? []) as never[]} />;
}
