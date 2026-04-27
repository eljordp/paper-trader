import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await ctx.params;
    const data = await getQuote(ticker.toUpperCase());
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quote failed" },
      { status: 404 }
    );
  }
}
