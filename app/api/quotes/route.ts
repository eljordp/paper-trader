import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({});
  try {
    const data = await getQuotes(symbols);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quotes failed" },
      { status: 500 }
    );
  }
}
