import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích sự kiện sản xuất phim/video để tạo danh sách job công việc.

Từ mô tả sự kiện, hãy trả về JSON hợp lệ (không markdown, không giải thích) theo định dạng:
{
  "groupName": "Tên nhóm ngắn gọn",
  "jobs": [
    {
      "title": "Tên job",
      "description": "Mô tả ngắn",
      "totalSalary": 1000000,
      "isOnSite": true,
      "expiresAt": "ISO date cuối ngày sự kiện hoặc null nếu hậu kỳ"
    }
  ]
}

Cấu trúc chuẩn cho 1 ngày quay phim (LUÔN tạo đúng thứ tự và số lượng này):

[TẠI CHỖ — isOnSite=true, expiresAt=cuối ngày quay]
1. Đạo diễn <tên phim> (1) — 3.000.000đ
2. Đạo diễn <tên phim> (2) — 3.000.000đ
3. Quay phim <tên phim> (Máy 1) — 1.200.000đ
4. Quay phim <tên phim> (Máy 2) — 1.200.000đ
5. Ánh sáng <tên phim> (1) — 800.000đ
6. Ánh sáng <tên phim> (2) — 800.000đ
7. Thu âm hiện trường <tên phim> — 1.000.000đ

[HẬU KỲ — isOnSite=false, expiresAt=null, mỗi tập = 1 job riêng]
8+. Dựng phim <tên phim> — Tập <N> — 3.000.000đ/tập (tạo N job nếu có N tập)

Quy tắc:
- Số tiền là số nguyên VNĐ, không có dấu phẩy
- expiresAt phải là ISO 8601 (cuối ngày sự kiện: T16:59:59.000Z tức 23:59 giờ VN) hoặc null
- Nếu không đề cập số tập → tạo 1 job dựng duy nhất
- groupName ngắn gọn, ví dụ: "Ngày quay Sát Giới 27/2"`;

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Chưa cấu hình GEMINI_API_KEY trong .env.local" },
      { status: 503 }
    );
  }

  try {
    const { input, currentYear, currentMonth } = await req.json();

    const userPrompt = `Ngày hiện tại: ${currentYear}-${String(currentMonth).padStart(2, "0")}
Sự kiện: ${input}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Gemini API lỗi: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text);

    // Thêm month từ expiresAt hoặc tháng hiện tại
    const jobs = (parsed.jobs ?? []).map((j: {
      title: string;
      description?: string;
      totalSalary: number;
      isOnSite: boolean;
      expiresAt?: string | null;
    }) => {
      const expiresAt = j.expiresAt || undefined;
      const month = expiresAt
        ? `${new Date(expiresAt).getFullYear()}-${String(new Date(expiresAt).getMonth() + 1).padStart(2, "0")}`
        : `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
      return {
        title: j.title,
        description: j.description || "",
        totalSalary: Number(j.totalSalary),
        isOnSite: Boolean(j.isOnSite),
        expiresAt: expiresAt || null,
        month,
      };
    });

    return NextResponse.json({ groupName: parsed.groupName ?? input, jobs });
  } catch (e) {
    return NextResponse.json({ error: `Lỗi xử lý: ${e}` }, { status: 500 });
  }
}
