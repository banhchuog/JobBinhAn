import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAllJobs, createJob, initSchema } from "@/lib/db";
import { Job } from "@/types";

export async function GET() {
  try {
    await initSchema();
    const jobs = await getAllJobs();
    return NextResponse.json(jobs);
  } catch {
    return NextResponse.json({ error: "Không thể đọc dữ liệu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initSchema();
    const body = await req.json();
    const now = new Date();
    const month = body.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const totalSalary = Number(body.totalSalary);
    const jobType = body.jobType === "mini" ? "mini" : "standard";
    const workUnits = body.workUnits !== undefined ? Number(body.workUnits) : undefined;
    const ratePerUnit = body.ratePerUnit !== undefined ? Number(body.ratePerUnit) : undefined;
    const job: Job = {
      id: randomUUID(),
      title: body.title,
      description: body.description || "",
      totalSalary,
      status: "OPEN",
      createdAt: now.toISOString(),
      month,
      assignments: [],
      jobType,
      ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      ...(body.groupId ? { groupId: body.groupId } : {}),
      ...(body.groupName ? { groupName: body.groupName } : {}),
      ...(body.jobCategory ? { jobCategory: body.jobCategory } : {}),
      ...(body.projectName ? { projectName: body.projectName } : {}),
      ...(body.workUnit ? { workUnit: body.workUnit } : {}),
      ...(body.episodeLabel ? { episodeLabel: body.episodeLabel } : {}),
      ...(body.dayLabel ? { dayLabel: body.dayLabel } : {}),
      ...(workUnits !== undefined && Number.isFinite(workUnits) ? { workUnits } : {}),
      ...(ratePerUnit !== undefined && Number.isFinite(ratePerUnit) ? { ratePerUnit } : {}),
      ...(body.unitPrice ? { unitPrice: Number(body.unitPrice) } : {}),
      ...(body.totalUnits ? { totalUnits: Number(body.totalUnits) } : {}),
    };
    const created = await createJob(job);
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Không thể tạo job" }, { status: 500 });
  }
}
