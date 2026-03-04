import { NextResponse } from "next/server";
import { deleteJob, getJobById, updateJob } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const job = await getJobById(id);
    if (!job) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });

    // Patch top-level job fields (createdAt, month, etc.)
    const updatedJob = { ...job };
    if (body.createdAt !== undefined) updatedJob.createdAt = body.createdAt;
    if (body.month !== undefined) updatedJob.month = body.month;

    // Patch a specific assignment's approvedAt
    if (body.assignmentId !== undefined && body.approvedAt !== undefined) {
      updatedJob.assignments = job.assignments.map((a) =>
        a.id === body.assignmentId ? { ...a, approvedAt: body.approvedAt } : a
      );
    }

    const result = await updateJob(updatedJob);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = await deleteJob(id);
    if (!ok) return NextResponse.json({ error: "Không tìm thấy job" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
