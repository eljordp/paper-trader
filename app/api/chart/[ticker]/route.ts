import { NextRequest, NextResponse } from "next/server";
import { getCandles, type Range } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VALID: Range[] = ["1D", "5D", "1M", "3M", "1Y", "5Y"];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await ctx.params;
    const rangeParam = (req.nextUrl.searchParams.get("range") ?? "1M") as Range;
    const range = VALID.includes(rangeParam) ? rangeParam : "1M";
    const candles = await getCandles(ticker.toUpperCase(), range);
    return NextResponse.json({ candles, range });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chart failed" },
      { status: 404 }
    );
  }
}
