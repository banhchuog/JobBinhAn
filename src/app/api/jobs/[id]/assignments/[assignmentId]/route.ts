import { NextResponse } from "next/server";
import { getJobById, updateJob, getEmployeeById, updateEmployee } from "@/lib/db";

// Xoá assignment đã APPROVED — trả % / clip về chợ, trừ lương khỏi balance nhân viên
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    const assignment = job.assignments.find((a) => a.id === assignmentId);
    if (!assignment) return NextResponse.json({ error: "Không tìm thấy phần việc" }, { status: 404 });
    if (assignment.status !== "APPROVED")
      return NextResponse.json({ error: "Chỉ có thể xoá phần việc đã duyệt" }, { status: 400 });

    // Remove assignment → return slots to pool
    const assignments = job.assignments.filter((a) => a.id !== assignmentId);

    // Determine new job status
    const newStatus = assignments.length === 0 ? "OPEN" : "IN_PROGRESS";
    const updatedJob = { ...job, assignments, status: newStatus as typeof job.status };
    await updateJob(updatedJob);

    // Deduct salary from employee balance
    const employee = await getEmployeeById(assignment.employeeId);
    if (employee) {
      await updateEmployee({
        ...employee,
        balance: Math.max(0, employee.balance - assignment.salaryEarned),
      });
    }

    return NextResponse.json(updatedJob);
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
