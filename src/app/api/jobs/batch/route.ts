import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createJobs, initSchema } from "@/lib/db";
import { Job } from "@/types";

export async function POST(req: Request) {
  try {
    await initSchema();
    const body = await req.json();
    const jobsInput: Array<{
      title: string;
      description?: string;
      totalSalary: number;
      month: string;
      expiresAt?: string;
      groupId?: string;
      groupName?: string;
      jobType?: "standard" | "mini";
      jobCategory?: string;
      projectName?: string;
      workUnit?: "episode" | "day";
      episodeLabel?: string;
      dayLabel?: string;
      workUnits?: number;
      ratePerUnit?: number;
      unitPrice?: number;
      totalUnits?: number;
    }> = body.jobs;

    if (!Array.isArray(jobsInput) || jobsInput.length === 0) {
      return NextResponse.json({ error: "Danh sách job không hợp lệ" }, { status: 400 });
    }

    const groupId = randomUUID();
    const now = new Date();

    const created: Job[] = jobsInput.map((item) => ({
      id: randomUUID(),
      title: item.title,
      description: item.description || "",
      totalSalary: Number(item.totalSalary),
      status: "OPEN",
      createdAt: now.toISOString(),
      month: item.month,
      assignments: [],
      groupId: item.groupId || groupId,
      jobType: item.jobType === "mini" ? "mini" : "standard",
      ...(item.groupName ? { groupName: item.groupName } : {}),
      ...(item.jobCategory ? { jobCategory: item.jobCategory } : {}),
      ...(item.projectName ? { projectName: item.projectName } : {}),
      ...(item.workUnit ? { workUnit: item.workUnit } : {}),
      ...(item.episodeLabel ? { episodeLabel: item.episodeLabel } : {}),
      ...(item.dayLabel ? { dayLabel: item.dayLabel } : {}),
      ...(item.workUnits !== undefined ? { workUnits: Number(item.workUnits) } : {}),
      ...(item.ratePerUnit !== undefined ? { ratePerUnit: Number(item.ratePerUnit) } : {}),
      ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
      ...(item.unitPrice !== undefined ? { unitPrice: Number(item.unitPrice) } : {}),
      ...(item.totalUnits !== undefined ? { totalUnits: Number(item.totalUnits) } : {}),
    }));

    await createJobs(created);

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
