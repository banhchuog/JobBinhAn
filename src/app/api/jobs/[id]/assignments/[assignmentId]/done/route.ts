import { NextResponse } from "next/server";
import { getJobById, updateJob } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const { id, assignmentId } = await params;

    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

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
