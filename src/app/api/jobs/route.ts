import { NextResponse } from "next/server";
import { getAllJobs, createJob } from "@/lib/db";
import { Job } from "@/types";

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json(jobs);
  } catch {
    return NextResponse.json({ error: "Không thể đọc dữ liệu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const now = new Date();
    const month = body.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const job: Job = {
      id: Math.random().toString(36).substring(7),
      title: body.title,
      description: body.description || "",
      totalSalary: Number(body.totalSalary),
      status: "OPEN",
      createdAt: now.toISOString(),
      month,
      assignments: [],
      ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      ...(body.groupId ? { groupId: body.groupId } : {}),
      ...(body.groupName ? { groupName: body.groupName } : {}),
    };
    const created = await createJob(job);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Không thể tạo job" }, { status: 500 });
  }
}
