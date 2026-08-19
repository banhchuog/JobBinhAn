import { NextResponse } from "next/server";
import { getAepRevenueForecast, initSchema } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await initSchema();
    const { searchParams } = new URL(req.url);
    const lookbackDays = Number(searchParams.get("lookbackDays") ?? 180);
    const data = await getAepRevenueForecast(lookbackDays);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
