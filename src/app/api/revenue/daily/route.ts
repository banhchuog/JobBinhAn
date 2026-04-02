import { NextResponse } from "next/server";
import { getDailyAepRevenue, initSchema } from "@/lib/db";

export async function GET() {
  try {
    await initSchema();
    const grouped = await getDailyAepRevenue();
    return NextResponse.json(grouped, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
