import { NextRequest, NextResponse } from "next/server";

// Proxy tới app Thu Chi để tránh CORS
// Query params: ?baseUrl=https://... (optional, fallback to env var)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const baseUrl =
    searchParams.get("baseUrl") ||
    process.env.THUCHI_BASE_URL ||
    "";

  if (!baseUrl) {
    return NextResponse.json({ error: "Chưa cấu hình URL app thu chi" }, { status: 400 });
  }

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/transactions`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      // timeout 8s
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `App thu chi trả về lỗi ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Không kết nối được: ${message}` },
      { status: 502 }
    );
  }
}
