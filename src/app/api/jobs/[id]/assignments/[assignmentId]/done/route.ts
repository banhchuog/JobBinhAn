import { NextResponse } from "next/server";
import { getJobById, updateJob } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const body = await req.json().catch(() => ({}));
    const doneUnits: number | undefined = body.units;

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    const assignment = job.assignments.find((a) => a.id === assignmentId);
    if (!assignment || assignment.status !== "WORKING")
      return NextResponse.json({ error: "Phần việc không hợp lệ" }, { status: 400 });

    // Mini job + partial done: split assignment
    if (job.jobType === "mini" && doneUnits && doneUnits < (assignment.units ?? 1)) {
      const remaining = (assignment.units ?? 1) - doneUnits;
      const pendingAssignment = {
        ...assignment,
        id: Math.random().toString(36).substring(7),
        units: doneUnits,
        salaryEarned: (job.unitPrice ?? 0) * doneUnits,
        status: "PENDING_APPROVAL" as const,
      };
      const updatedAssignment = {
        ...assignment,
        units: remaining,
        salaryEarned: (job.unitPrice ?? 0) * remaining,
      };
      const assignments = job.assignments.map((a) => a.id === assignmentId ? updatedAssignment : a);
      assignments.push(pendingAssignment);
      const updatedJob = { ...job, assignments };
      await updateJob(updatedJob);
      return NextResponse.json(updatedJob);
    }

    // Full done: mark whole assignment as PENDING_APPROVAL
    const assignments = job.assignments.map((a) =>
      a.id === assignmentId && a.status === "WORKING"
        ? { ...a, status: "PENDING_APPROVAL" as const }
        : a
    );
    const updatedJob = { ...job, assignments };
    await updateJob(updatedJob);
    return NextResponse.json(updatedJob);
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
