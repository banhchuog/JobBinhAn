import { NextResponse } from "next/server";
import { getJobById, updateJob } from "@/lib/db";
import { JobAssignment } from "@/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { employeeId, employeeName, percentage, units } = await req.json();

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    // ── Mini job: claim 1 unit at a time ──────────────────────
    if (job.jobType === "mini") {
      const remaining = (job.totalUnits ?? 0) - job.assignments.length;
      if (remaining <= 0) {
        return NextResponse.json({ error: "Hết clip rồi!" }, { status: 400 });
      }
      const newAssignment: JobAssignment = {
        id: Math.random().toString(36).substring(7),
        employeeId,
        employeeName,
        percentage: 0,
        units: units ?? 1,
        salaryEarned: job.unitPrice ?? 0,
        assignedAt: new Date().toISOString(),
        status: "WORKING",
      };
      const updatedJob = {
        ...job,
        assignments: [...job.assignments, newAssignment],
        status: "IN_PROGRESS" as const,
      };
      await updateJob(updatedJob);
      return NextResponse.json(updatedJob);
    }

    // ── Standard job: percentage-based ───────────────────────
    const currentTotal = job.assignments.reduce((acc, a) => acc + a.percentage, 0);
    if (currentTotal + percentage > 100) {
      return NextResponse.json(
        { error: `Chỉ còn lại ${100 - currentTotal}% cho công việc này!` },
        { status: 400 }
      );
    }

    const newAssignment: JobAssignment = {
      id: Math.random().toString(36).substring(7),
      employeeId,
      employeeName,
      percentage,
      salaryEarned: (job.totalSalary * percentage) / 100,
      assignedAt: new Date().toISOString(),
      status: "WORKING",
    };

    const updatedJob = {
      ...job,
      assignments: [...job.assignments, newAssignment],
      status: "IN_PROGRESS" as const,
    };

    await updateJob(updatedJob);
    return NextResponse.json(updatedJob);
  } catch {
    return NextResponse.json({ error: "Không thể nhận job" }, { status: 500 });
  }
}
