import { NextResponse } from "next/server";
import { getIntradayAepRevenue, initSchema } from "@/lib/db";

export async function GET() {
  try {
    await initSchema();
    const data = await getIntradayAepRevenue();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
