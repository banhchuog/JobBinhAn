import { NextResponse } from "next/server";
import { initSchema, upsertCassoTransactions } from "@/lib/db";
import { getTransactions, normalizeCassoTransaction } from "@/lib/casso";

export const dynamic = "force-dynamic"; // Không cache API này

export async function GET() {
  try {
    // Vì Webhook Secret nãy ta tự bịa ra không có quyền gọi API Casso, 
    // ta cần 1 API Key thật (lấy tại Thiết lập > API Keys trên giao diện Casso)
    const apiKey = (process.env.CASSO_API_KEY?.trim() || process.env.CASSO_WEBHOOK_SECRET?.trim()) ?? "";
    if (!apiKey || !apiKey.startsWith("AK_")) {
      return NextResponse.json(
        { error: "Vui lòng cấu hình CASSO_API_KEY (bắt đầu bằng AK_...) trên Railway để dùng tính năng đồng bộ API này" },
        { status: 503 }
      );
    }

    // Lấy giao dịch trong vòng 30 ngày gần nhất
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const fromDate = d.toISOString().slice(0, 10); 

    // Lấy tối đa 1000 record để đảm bảo không bị thiếu trong 30 ngày
    const url = `https://oauth.casso.vn/v2/transactions?fromDate=${fromDate}&limit=1000&sort=DESC`;
    
    // Gọi API của Casso
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Apikey ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Gọi API Casso thất bại (HTTP ${res.status})`, details: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    // Chuẩn bị DB và phân tích dữ liệu trả về giống hệt Webhook
    await initSchema();
    const rawTransactions = getTransactions(data);
    const storedTxs = rawTransactions
      .map(normalizeCassoTransaction)
      .filter((tx): tx is NonNullable<ReturnType<typeof normalizeCassoTransaction>> => tx !== null);

    const savedCount = await upsertCassoTransactions(storedTxs);

    return NextResponse.json({
      ok: true,
      message: "Đồng bộ giao dịch Casso thành công!",
      fetched: rawTransactions.length,
      saved: savedCount,
    });

  } catch (error) {
    console.error("Casso sync error:", error);
    return NextResponse.json(
      { error: "Có lỗi xảy ra khi đồng bộ" },
      { status: 500 }
    );
  }
}
