import DashboardClient from "./dashboard-client";
import Landing from "@/components/Landing";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return <Landing />;
  }

  let snapshots: Array<{ recorded_at: string; equity: number }> = [];
  const { data: profile } = await sb
    .from("profiles")
    .select("active_account_id")
    .eq("id", user.id)
    .single();
  const activeId = (profile as { active_account_id: string | null } | null)?.active_account_id;
  if (activeId) {
    const { data } = await sb
      .from("equity_snapshots")
      .select("recorded_at, equity")
      .eq("account_id", activeId)
      .order("recorded_at", { ascending: true })
      .limit(500);
    snapshots = (data ?? []).map((r) => ({
      recorded_at: (r as { recorded_at: string }).recorded_at,
      equity: Number((r as { equity: number }).equity),
    }));
  }

  return <DashboardClient equitySnapshots={snapshots} />;
}
