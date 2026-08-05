import { NextResponse } from "next/server";
import { getHourlyAepRevenue, initSchema } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await initSchema();
    const { searchParams } = new URL(req.url);
    const hoursParam = searchParams.get("hours");
    const daysParam = searchParams.get("days");
    const hours = hoursParam !== null ? Number(hoursParam) : Number(daysParam ?? 7) * 24;
    const data = await getHourlyAepRevenue(hours);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
