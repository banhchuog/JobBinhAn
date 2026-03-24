import { NextRequest, NextResponse } from "next/server";

// Proxy tới API doanh thu anhemphim.vn theo từng ngày
// Upstream: GET https://anhemphim.vn/api/revenue/daily?start_date=DD/MM/YYYY&end_date=DD/MM/YYYY
// Frontend truyền: ?month=YYYY-MM  → tự tính start_date = 01/MM/YYYY, end_date = 01/MM+1/YYYY

function toVnDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";

  try {
    let startDate: string;
    let endDate: string;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const first = new Date(y, m - 1, 1);
      const next  = new Date(y, m, 1); // đầu tháng sau (exclusive)
      startDate = toVnDate(first);
      endDate   = toVnDate(next);
    } else {
      // fallback: 30 ngày trước đến hôm nay
      const today = new Date();
      const past  = new Date(today); past.setDate(today.getDate() - 30);
      startDate = toVnDate(past);
      endDate   = toVnDate(today);
    }

    const upstream = `https://anhemphim.vn/api/revenue/daily?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;

    const res = await fetch(upstream, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
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
