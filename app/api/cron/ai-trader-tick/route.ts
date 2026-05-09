import { NextResponse } from "next/server";
import { runAiTraderTick } from "@/lib/aiTraderEngine";
import { isCronAuthorized } from "@/lib/aiTrader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runAiTraderTick();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  return GET(req);
}
