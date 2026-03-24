import { NextRequest, NextResponse } from "next/server";

// Proxy tới API doanh thu anhemphim.vn theo từng ngày
// Endpoint: GET https://anhemphim.vn/api/revenue/daily?month=YYYY-MM
// Response: { "YYYY-MM-DD": number, ... }
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  try {
    const url = month
      ? `https://anhemphim.vn/api/revenue/daily?month=${month}`
      : `https://anhemphim.vn/api/revenue/daily`;

    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 }, // cache 5 phút
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API doanh thu ngày trả về lỗi ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
