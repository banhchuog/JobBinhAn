import { NextResponse } from "next/server";
import { getHourlyAepRevenue, initSchema } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await initSchema();
    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days") ?? 7);
    const data = await getHourlyAepRevenue(days);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
