import { NextResponse } from "next/server";
import { getJobById, updateJob, getEmployeeById, updateEmployee } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    const assignment = job.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return NextResponse.json({ error: "Không tìm thấy phần việc" }, { status: 404 });
    if (assignment.status !== "PENDING_APPROVAL")
      return NextResponse.json({ error: "Phần việc chưa được gửi duyệt" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const note: string | undefined = body.note?.trim() || undefined;

    // Mark assignment as APPROVED
    const approvedAt = new Date().toISOString();
    const assignments = job.assignments.map((a) =>
      a.id === assignmentId ? { ...a, status: "APPROVED" as const, approvedAt, ...(note ? { note } : {}) } : a
    );

    const allApproved = assignments.every((a) => a.status === "APPROVED");
    const updatedJob = {
      ...job,
      assignments,
      status: allApproved ? ("COMPLETED" as const) : job.status,
    };
    await updateJob(updatedJob);

    // Credit salary to employee balance
    const employee = await getEmployeeById(assignment.employeeId);
    if (employee) {
      await updateEmployee({ ...employee, balance: employee.balance + assignment.salaryEarned });
    }

    return NextResponse.json(updatedJob);
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
