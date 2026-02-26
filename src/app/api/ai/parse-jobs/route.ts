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

Quy tắc:
- Job "tại chỗ" (quay phim, ánh sáng, âm thanh, đạo cụ, make-up, hậu trường...): isOnSite=true, expiresAt=cuối ngày sự kiện
- Job "hậu kỳ" (dựng phim, color, mix âm thanh, motion graphic...): isOnSite=false, expiresAt=null
- Lương tham khảo: quay phim 1.2tr/ngày, ánh sáng 700k/người, âm thanh 1tr, dựng 3tr/tập, color 1.5tr/tập
- Tạo đủ job cho 1 ngày quay thực tế (ít nhất: quay×2, ánh sáng×2, âm thanh×1, dựng×số tập)
- Số tiền là số nguyên VNĐ, không có dấu phẩy
- expiresAt phải là ISO 8601 (cuối ngày: T23:59:59.000Z) hoặc null`;

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
