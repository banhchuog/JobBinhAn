import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích tài chính cho công ty sản xuất phim/video có website anhemphim.vn.

Nhiệm vụ: Phân loại các khoản chi phí và tiêu đề công việc xem có thuộc dự án anhemphim.vn không.

**CHI PHÍ THUỘC anhemphim.vn** (trả về true):
- Chi phí sản xuất phim, phóng sự, video content
- Băng thông Bunny CDN / streaming
- Chi phí thuê bối cảnh quay phim, đạo cụ phim
- Phần mềm dựng phim, biên tập video (Premiere, DaVinci...)
- Chi phí máy quay, thiết bị quay phim (thuê)
- Chi phí âm nhạc, bản quyền âm thanh cho phim
- Hosting/server cho website anhemphim.vn
- Quảng cáo phim/content trên mạng xã hội

**CHI PHÍ KHÔNG THUỘC anhemphim.vn** (trả về false):
- Quay quảng cáo TVC, event cho khách hàng bên ngoài
- Mua thiết bị (máy quay, máy tính, đèn...) — đây là tài sản
- Chi phí văn phòng phẩm, setup văn phòng
- Lương/thưởng hành chính, bảo hiểm nhân viên văn phòng
- Chi phí ăn uống, đi lại công tác không liên quan phim
- Chi phí marketing sản phẩm không phải anhemphim.vn

**CÔNG VIỆC LƯƠNG THUỘC anhemphim.vn** (isAEP=true):
- Dựng phim, hậu kỳ, biên tập video
- Quay phim, đạo diễn, ánh sáng, thu âm hiện trường
- Color grading, motion graphics, âm nhạc phim
- Bất kỳ job nào có tiêu đề rõ là sản xuất nội dung phim

**CÔNG VIỆC LƯƠNG KHÔNG THUỘC anhemphim.vn** (isAEP=false):
- Quay quảng cáo cho khách hàng
- Quản lý, kế toán, hành chính
- Setup thiết bị, bảo trì

Trả về JSON hợp lệ (không markdown), dạng:
{
  "expenses": { "<id>": true/false, ... },
  "salaryJobs": { "<jobId>": true/false, ... }
}`;

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "Chưa cấu hình GEMINI_API_KEY" }, { status: 503 });
  }

  try {
    const { transactions, jobs } = await req.json();

    const txList = (transactions as { id: number; subject: string; note: string; amount: number; currency: string }[])
      .map((t) => `id=${t.id}: "${t.subject}"${t.note ? ` (ghi chú: ${t.note})` : ""} — ${t.amount} ${t.currency}`)
      .join("\n");

    const jobList = (jobs as { id: string; title: string; description: string }[])
      .map((j) => `id=${j.id}: "${j.title}"${j.description ? ` — ${j.description}` : ""}`)
      .join("\n");

    const userPrompt = `DANH SÁCH CHI PHÍ CẦN PHÂN LOẠI:\n${txList}\n\nDANH SÁCH JOB LƯƠNG CẦN PHÂN LOẠI:\n${jobList}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Gemini lỗi ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
