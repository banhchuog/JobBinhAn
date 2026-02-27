import { NextResponse } from "next/server";

// Proxy tới API doanh thu anhemphim.vn để tránh CORS
// Endpoint: GET https://anhemphim.vn/api/revenue/monthly
// Response: { "YYYY-MM": number, ... }
export async function GET() {
  try {
    const res = await fetch("https://anhemphim.vn/api/revenue/monthly", {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 }, // cache 5 phút
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `API doanh thu trả về lỗi ${res.status}` },
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
