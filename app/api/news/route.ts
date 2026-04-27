import { NextRequest, NextResponse } from "next/server";
import { getNews } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? undefined;
  try {
    const items = await getNews(symbol);
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "News failed" },
      { status: 500 }
    );
  }
}
