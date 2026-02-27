import { NextResponse } from "next/server";

// Proxy tới app Thu Chi — cấu hình qua Railway env vars:
// THUCHI_BASE_URL = https://thuchi.up.railway.app
// THUCHI_API_KEY  = <api key từ app thu chi>
export async function GET() {
  const baseUrl = process.env.THUCHI_BASE_URL || "";
  const apiKey  = process.env.THUCHI_API_KEY  || "";

  if (!baseUrl || !apiKey) {
    return NextResponse.json(
      { error: "Chưa cấu hình THUCHI_BASE_URL / THUCHI_API_KEY trong Railway" },
      { status: 503 }
    );
  }

  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1/transactions`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `App thu chi trả về lỗi ${res.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
