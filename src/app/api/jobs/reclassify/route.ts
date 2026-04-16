import { NextResponse } from "next/server";
import { getAllJobs, initSchema, updateJob } from "@/lib/db";
import { Job } from "@/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const JOB_CATEGORY_OPTIONS = [
  "Hậu kỳ",
  "Kịch bản",
  "Đạo diễn",
  "Quay phim",
  "Ánh sáng",
  "Thu âm",
  "Thiết kế",
  "VFX",
  "Khác",
] as const;

type JobCategory = (typeof JOB_CATEGORY_OPTIONS)[number];

type AiResponseShape = {
  categories?: Record<string, string>;
};

const SYSTEM_PROMPT = `Bạn là trợ lý phân loại job sản xuất phim/video.

Nhiệm vụ: Với mỗi job, chọn đúng 1 jobCategory trong danh sách sau:
- Hậu kỳ
- Kịch bản
- Đạo diễn
- Quay phim
- Ánh sáng
- Thu âm
- Thiết kế
- VFX
- Khác

Quy tắc:
- Chỉ trả về JSON hợp lệ, không markdown, không giải thích.
- Ưu tiên chính xác. Nếu mơ hồ, chọn "Khác".
- "Dựng phim", "editor", "biên tập", "color grading" => Hậu kỳ
- "screenplay", "writer", "kịch bản" => Kịch bản
- "đạo diễn", "director" => Đạo diễn
- "quay phim", "DOP", "camera" => Quay phim
- "ánh sáng", "gaffer", "light" => Ánh sáng
- "thu âm", "sound", "boom" => Thu âm
- "thiết kế", "art", "poster", "thumbnail" => Thiết kế
- "vfx", "compositing", "cgi" => VFX

Định dạng JSON:
{
  "categories": {
    "<jobId>": "Hậu kỳ"
  }
}`;

function normalizeText(value = "") {
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

function toValidCategory(value: unknown): JobCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return JOB_CATEGORY_OPTIONS.find((option) => option.toLowerCase() === normalized) ?? null;
}

function classifyJobHeuristically(job: Job): JobCategory | null {
  const text = normalizeText(`${job.title ?? ""} ${job.description ?? ""} ${job.projectName ?? ""}`);
  if (!text) return null;

  if (includesAny(text, ["vfx", "compositing", "cgi", "3d", "tracking", "rotoscope"])) return "VFX";
  if (includesAny(text, ["kich ban", "screenplay", "writer", "bien kich", "viet noi dung"])) return "Kịch bản";
  if (includesAny(text, ["dao dien", "director"])) return "Đạo diễn";
  if (includesAny(text, ["quay phim", "camera", "may 1", "may 2", "dop", "cinematography"])) return "Quay phim";
  if (includesAny(text, ["anh sang", "gaffer", "lighting", "light"])) return "Ánh sáng";
  if (includesAny(text, ["thu am", "sound", "boom", "hien truong audio", "audio record"])) return "Thu âm";
  if (includesAny(text, ["thiet ke", "art", "poster", "thumbnail", "designer", "design"])) return "Thiết kế";
  if (includesAny(text, ["hau ky", "dung phim", "editor", "edit", "color grading", "bien tap", "post production", "postprod", "subtitle"])) return "Hậu kỳ";

  return null;
}

async function classifyJobsWithAi(jobs: Job[]): Promise<Record<string, JobCategory>> {
  if (!GEMINI_API_KEY || jobs.length === 0) return {};

  const jobList = jobs
    .map((job) => {
      const parts = [job.title, job.description, job.projectName, job.workUnit === "day" ? `theo ngày ${job.dayLabel ?? ""}` : "", job.workUnit === "episode" ? `theo tập ${job.episodeLabel ?? ""}` : ""]
        .filter(Boolean)
        .join(" | ");
      return `id=${job.id}: ${parts}`;
    })
    .join("\n");

  const userPrompt = `Phân loại các job sau vào đúng 1 jobCategory:\n${jobList}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 2048,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return {};

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as AiResponseShape;

    return Object.fromEntries(
      Object.entries(parsed.categories ?? {})
        .map(([jobId, category]) => [jobId, toValidCategory(category)])
        .filter((entry): entry is [string, JobCategory] => Boolean(entry[1]))
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  try {
    await initSchema();
    const body = await req.json().catch(() => ({}));
    const requestedIds = Array.isArray(body?.jobIds)
      ? new Set(body.jobIds.map((value: unknown) => String(value)))
      : null;

    const allJobs = await getAllJobs();
    const targets = allJobs.filter((job) => {
      if (job.jobType === "mini") return false;
      if (requestedIds && !requestedIds.has(job.id)) return false;
      return !job.jobCategory?.trim();
    });

    if (targets.length === 0) {
      return NextResponse.json({
        scanned: 0,
        updated: 0,
        remaining: 0,
        source: "none",
        message: "Không có job cũ nào chưa phân loại.",
      });
    }

    const heuristicResults = Object.fromEntries(
      targets
        .map((job) => [job.id, classifyJobHeuristically(job)])
        .filter((entry): entry is [string, JobCategory] => Boolean(entry[1]))
    );

    const unresolvedJobs = targets.filter((job) => !heuristicResults[job.id]);
    const aiResults = await classifyJobsWithAi(unresolvedJobs);

    let updated = 0;
    for (const job of targets) {
      const nextCategory = heuristicResults[job.id] ?? aiResults[job.id];
      if (!nextCategory) continue;
      const result = await updateJob({ ...job, jobCategory: nextCategory });
      if (result) updated += 1;
    }

    const remaining = Math.max(0, targets.length - updated);
    const source = Object.keys(aiResults).length > 0 ? "hybrid" : (Object.keys(heuristicResults).length > 0 ? "heuristic" : "none");

    return NextResponse.json({
      scanned: targets.length,
      updated,
      remaining,
      source,
      warning: !GEMINI_API_KEY ? "Chưa cấu hình Gemini, đang dùng bộ lọc thông minh." : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể phân loại lại job cũ.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
