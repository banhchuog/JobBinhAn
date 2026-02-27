import { NextResponse } from "next/server";
import { getJobById, updateJob } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const { percentage, units: shareUnits } = await req.json();

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    const assignment = job.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return NextResponse.json({ error: "Không tìm thấy assignment" }, { status: 404 });
    if (assignment.status !== "WORKING") {
      return NextResponse.json({ error: "Chỉ có thể nhường khi đang làm" }, { status: 400 });
    }

    // ── Mini job: units-based share ──────────────────────────
    if (job.jobType === "mini") {
      const currentUnits = assignment.units ?? 1;
      if (!shareUnits || shareUnits <= 0 || shareUnits > currentUnits) {
        return NextResponse.json(
          { error: `Số clip không hợp lệ (tối đa ${currentUnits})` },
          { status: 400 }
        );
      }
      const newUnits = currentUnits - shareUnits;
      const updatedAssignments =
        newUnits === 0
          ? job.assignments.filter((a) => a.id !== assignmentId)
          : job.assignments.map((a) =>
              a.id === assignmentId
                ? { ...a, units: newUnits, salaryEarned: (job.unitPrice ?? 0) * newUnits }
                : a
            );
      const newStatus = updatedAssignments.length === 0 ? "OPEN" : "IN_PROGRESS";
      const updatedJob = { ...job, assignments: updatedAssignments, status: newStatus as typeof job.status };
      await updateJob(updatedJob);
      return NextResponse.json(updatedJob);
    }

    // ── Standard job: percentage-based share ─────────────────
    if (percentage <= 0 || percentage > assignment.percentage) {
      return NextResponse.json(
        { error: `Phần trăm không hợp lệ (tối đa ${assignment.percentage}%)` },
        { status: 400 }
      );
    }

    const newPct = assignment.percentage - percentage;

    const updatedAssignments =
      newPct === 0
        ? job.assignments.filter((a) => a.id !== assignmentId)
        : job.assignments.map((a) =>
            a.id === assignmentId
              ? { ...a, percentage: newPct, salaryEarned: (job.totalSalary * newPct) / 100 }
              : a
          );

    const newStatus = updatedAssignments.length === 0 ? "OPEN" : "IN_PROGRESS";
    const updatedJob = { ...job, assignments: updatedAssignments, status: newStatus as typeof job.status };

    await updateJob(updatedJob);
    return NextResponse.json(updatedJob);
  } catch {
    return NextResponse.json({ error: "Không thể share job" }, { status: 500 });
  }
}
