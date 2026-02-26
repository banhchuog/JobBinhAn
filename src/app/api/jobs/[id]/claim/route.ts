import { NextResponse } from "next/server";
import { getJobById, updateJob } from "@/lib/db";
import { JobAssignment } from "@/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { employeeId, employeeName, percentage } = await req.json();

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    // Không cho nhận thêm khi đang có assignment chưa xong
    const alreadyActive = job.assignments.some(
      (a) => a.employeeId === employeeId && (a.status === "WORKING" || a.status === "PENDING_APPROVAL")
    );
    if (alreadyActive) {
      return NextResponse.json(
        { error: "Bạn đang làm job này rồi! Hãy hoàn thành và chờ duyệt trước." },
        { status: 400 }
      );
    }

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
