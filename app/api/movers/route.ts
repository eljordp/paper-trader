import { NextResponse } from "next/server";
import { getMarketMovers } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getMarketMovers();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Movers failed" },
      { status: 500 }
    );
  }
}
