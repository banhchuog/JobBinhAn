import { NextResponse } from "next/server";
import { getJobById, updateJob } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;
    const { percentage } = await req.json(); // % muốn trả lại chợ

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    const assignment = job.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return NextResponse.json({ error: "Không tìm thấy assignment" }, { status: 404 });
    if (assignment.status !== "WORKING") {
      return NextResponse.json({ error: "Chỉ có thể share khi đang làm" }, { status: 400 });
    }
    if (percentage <= 0 || percentage > assignment.percentage) {
      return NextResponse.json(
        { error: `Phần trăm không hợp lệ (tối đa ${assignment.percentage}%)` },
        { status: 400 }
      );
    }

    const newPct = assignment.percentage - percentage;

    const updatedAssignments =
      newPct === 0
        ? job.assignments.filter((a) => a.id !== assignmentId) // trả hết → xoá luôn
        : job.assignments.map((a) =>
            a.id === assignmentId
              ? { ...a, percentage: newPct, salaryEarned: (job.totalSalary * newPct) / 100 }
              : a
          );

    // Nếu không còn ai → OPEN, còn người → IN_PROGRESS
    const newStatus = updatedAssignments.length === 0 ? "OPEN" : "IN_PROGRESS";
    const updatedJob = { ...job, assignments: updatedAssignments, status: newStatus as typeof job.status };

    await updateJob(updatedJob);
    return NextResponse.json(updatedJob);
  } catch {
    return NextResponse.json({ error: "Không thể share job" }, { status: 500 });
  }
}
