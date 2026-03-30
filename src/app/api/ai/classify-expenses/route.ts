import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

type TransactionInput = {
  id: number | string;
  subject?: string;
  note?: string;
  amount?: number;
  currency?: string;
};

type JobInput = {
  id: string;
  title?: string;
  description?: string;
};

const SYSTEM_PROMPT = `Bạn là chuyên gia phân tích tài chính cho dự án anhemphim.vn.

Nhiệm vụ: Phân loại các khoản chi phí và tiêu đề công việc xem có thuộc anhemphim.vn không.
ƯU TIÊN ĐỘ CHÍNH XÁC. Nếu không chắc chắn, trả về false.

**CHI PHÍ THUỘC anhemphim.vn** (trả về true):
- Chi phí sản xuất phim, web drama, series, phim truyện
- Chi phí hậu kỳ phim, dựng phim, âm nhạc phim, color grading, VFX
- Băng thông stream video, Bunny CDN, video CDN, streaming, transcode, VOD
- Chi phí thuê bối cảnh quay phim, đạo cụ phim
- Phần mềm hậu kỳ/phục vụ dựng phim (Premiere, DaVinci...)
- Chi phí máy quay, thiết bị quay phim (thuê)
- Chi phí âm nhạc, bản quyền âm thanh cho phim
- Hosting/server chỉ khi có ngữ cảnh rõ là phục vụ phát video/stream video của anhemphim.vn
- Chi phí khác nhưng có ngữ cảnh rõ là phục vụ sản xuất phim của anhemphim.vn

**CHI PHÍ KHÔNG THUỘC anhemphim.vn** (trả về false):
- Quảng cáo, TVC, booking ads, media buy, chạy ads cho khách hàng
- Sitcom
- Shortclip, short clip, clip ngắn, reels, TikTok clip
- Mua thiết bị (máy quay, máy tính, đèn...) — đây là tài sản
- Chi phí văn phòng phẩm, setup văn phòng
- Lương/thưởng hành chính, bảo hiểm nhân viên văn phòng
- Chi phí ăn uống, đi lại công tác không liên quan phim
- Chi phí marketing nói chung nếu không phải sản xuất phim

**CÔNG VIỆC LƯƠNG THUỘC anhemphim.vn** (isAEP=true):
- Dựng phim, hậu kỳ phim, biên tập phim
- Quay phim, đạo diễn, ánh sáng, thu âm hiện trường
- Color grading, motion graphics, âm nhạc phim
- Bất kỳ job nào có tiêu đề rõ là sản xuất phim cho anhemphim.vn

**CÔNG VIỆC LƯƠNG KHÔNG THUỘC anhemphim.vn** (isAEP=false):
- Quay quảng cáo cho khách hàng
- Sitcom, shortclip, clip quảng cáo ngắn
- Quản lý, kế toán, hành chính
- Setup thiết bị, bảo trì

Trả về JSON hợp lệ (không markdown), dạng:
{
  "expenses": { "<id>": true/false, ... },
  "salaryJobs": { "<jobId>": true/false, ... }
}`;

const EXCLUDED_EXPENSE_KEYWORDS = [
  "quang cao", "tvc", "ads", "facebook ads", "google ads", "booking ads", "media buy",
  "sitcom", "shortclip", "short clip", "clip ngan", "reels", "tiktok clip",
  "bao hiem", "bhxh", "bhyt", "tncn", "van phong", "van phong pham", "hanh chinh",
  "ke toan", "event", "su kien", "marketing",
];

const EXPENSE_ASSET_KEYWORDS = [
  "mua may quay", "mua may tinh", "mua den", "mua thiet bi", "mua camera", "mua o cung", "mua macbook",
];

const STRONG_AEP_EXPENSE_KEYWORDS = [
  "anhemphim", "anh em phim", "bunnyway", "bunnycdn", "bunny net", "bunny cdn",
  "bandwidth", "bang thong", "streaming", "stream video", "video streaming", "video cdn", "vod", "transcode",
];

const FILM_PRODUCTION_KEYWORDS = [
  "san xuat phim", "phim truyen", "web drama", "series", "hau ky phim", "dung phim", "quay phim",
  "dao dien", "boi canh", "dao cu", "casting", "color grading", "vfx", "thu am hien truong",
  "am nhac phim", "ban quyen am thanh", "bien tap phim",
];

const STREAM_CONTEXT_KEYWORDS = ["video", "stream", "streaming", "vod", "cdn", "bandwidth", "bang thong", "transcode"];
const CLOUD_VENDOR_KEYWORDS = ["google cloud", "aws", "cloudflare", "digitalocean", "bunny", "cdn"];

const EXCLUDED_JOB_KEYWORDS = ["quang cao", "tvc", "sitcom", "shortclip", "short clip", "hanh chinh", "ke toan", "bao tri"];
const AEP_JOB_KEYWORDS = [
  "dung phim", "hau ky phim", "quay phim", "dao dien", "anh sang", "thu am hien truong",
  "color grading", "motion graphics", "am nhac phim", "san xuat phim", "web drama", "phim truyen",
];

function normalizeText(value: string = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyExpenseHeuristically(transaction: TransactionInput): boolean | null {
  const text = normalizeText(`${transaction.subject ?? ""} ${transaction.note ?? ""}`);
  if (!text) return null;

  if (includesAny(text, EXCLUDED_EXPENSE_KEYWORDS) || includesAny(text, EXPENSE_ASSET_KEYWORDS)) {
    return false;
  }

  if (includesAny(text, STRONG_AEP_EXPENSE_KEYWORDS)) {
    return true;
  }

  if (includesAny(text, CLOUD_VENDOR_KEYWORDS) && includesAny(text, STREAM_CONTEXT_KEYWORDS)) {
    return true;
  }

  if (includesAny(text, FILM_PRODUCTION_KEYWORDS)) {
    return true;
  }

  return null;
}

function classifyJobHeuristically(job: JobInput): boolean | null {
  const text = normalizeText(`${job.title ?? ""} ${job.description ?? ""}`);
  if (!text) return null;
  if (includesAny(text, EXCLUDED_JOB_KEYWORDS)) return false;
  if (includesAny(text, AEP_JOB_KEYWORDS)) return true;
  return null;
}

function toBooleanMap<T extends { id: string | number }>(
  items: T[],
  heuristics: Record<string, boolean | null>,
  aiValues?: Record<string, unknown>
) {
  return Object.fromEntries(
    items.map((item) => {
      const id = String(item.id);
      const heuristicValue = heuristics[id];
      if (heuristicValue !== null && heuristicValue !== undefined) {
        return [id, heuristicValue];
      }
      return [id, aiValues?.[id] === true];
    })
  );
}

function buildHeuristicMaps(transactions: TransactionInput[], jobs: JobInput[]) {
  const expenseHeuristics = Object.fromEntries(
    transactions.map((transaction) => [String(transaction.id), classifyExpenseHeuristically(transaction)])
  );
  const salaryJobHeuristics = Object.fromEntries(
    jobs.map((job) => [String(job.id), classifyJobHeuristically(job)])
  );

  return { expenseHeuristics, salaryJobHeuristics };
}

function buildResponse(
  transactions: TransactionInput[],
  jobs: JobInput[],
  heuristics: ReturnType<typeof buildHeuristicMaps>,
  aiParsed?: { expenses?: Record<string, unknown>; salaryJobs?: Record<string, unknown> },
  warning?: string
) {
  return {
    expenses: toBooleanMap(transactions, heuristics.expenseHeuristics, aiParsed?.expenses),
    salaryJobs: toBooleanMap(jobs, heuristics.salaryJobHeuristics, aiParsed?.salaryJobs),
    source: aiParsed ? "hybrid" : "heuristic",
    ...(warning ? { warning } : {}),
  };
}

export async function POST(req: Request) {
  let transactions: TransactionInput[] = [];
  let jobs: JobInput[] = [];

  try {
    const body = await req.json();
    transactions = (Array.isArray(body?.transactions) ? body.transactions : []) as TransactionInput[];
    jobs = (Array.isArray(body?.jobs) ? body.jobs : []) as JobInput[];
    const heuristics = buildHeuristicMaps(transactions, jobs);

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        buildResponse(transactions, jobs, heuristics, undefined, "Chưa cấu hình Gemini, dùng bộ lọc thông minh."),
      );
    }

    if (transactions.length === 0 && jobs.length === 0) {
      return NextResponse.json(buildResponse(transactions, jobs, heuristics));
    }

    const txList = transactions
      .map((t) => `id=${t.id}: "${t.subject}"${t.note ? ` (ghi chú: ${t.note})` : ""} — ${t.amount} ${t.currency}`)
      .join("\n");

    const jobList = jobs
      .map((j) => `id=${j.id}: "${j.title}"${j.description ? ` — ${j.description}` : ""}`)
      .join("\n");

    const userPrompt = `DANH SÁCH CHI PHÍ CẦN PHÂN LOẠI:\n${txList}\n\nDANH SÁCH JOB LƯƠNG CẦN PHÂN LOẠI:\n${jobList}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

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
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        buildResponse(transactions, jobs, heuristics, undefined, `Gemini lỗi ${res.status}, dùng bộ lọc thông minh.`),
      );
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return NextResponse.json(buildResponse(transactions, jobs, heuristics, parsed));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (transactions.length > 0 || jobs.length > 0) {
      const heuristics = buildHeuristicMaps(transactions, jobs);
      return NextResponse.json(buildResponse(transactions, jobs, heuristics, undefined, `AI lỗi: ${msg}. Dùng bộ lọc thông minh.`));
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
