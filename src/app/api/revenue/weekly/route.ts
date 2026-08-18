import { NextResponse } from "next/server";
import { getWeeklyAepRevenue, initSchema } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await initSchema();
    const { searchParams } = new URL(req.url);
    const weeks = Number(searchParams.get("weeks") ?? 12);
    const data = await getWeeklyAepRevenue(weeks);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
