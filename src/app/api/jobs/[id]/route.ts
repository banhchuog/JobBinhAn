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
    if (body.title !== undefined) updatedJob.title = String(body.title ?? "").trim();
    if (body.description !== undefined) updatedJob.description = String(body.description ?? "");

    if (body.expiresAt !== undefined) {
      updatedJob.expiresAt = body.expiresAt ? String(body.expiresAt) : undefined;
    }

    if (body.groupId !== undefined) {
      updatedJob.groupId = body.groupId ? String(body.groupId) : undefined;
    }

    if (body.groupName !== undefined) {
      updatedJob.groupName = body.groupName ? String(body.groupName) : undefined;
    }

    if (body.jobCategory !== undefined) {
      updatedJob.jobCategory = body.jobCategory ? String(body.jobCategory) : undefined;
    }

    if (body.projectName !== undefined) {
      updatedJob.projectName = body.projectName ? String(body.projectName) : undefined;
    }

    if (body.workUnit !== undefined) {
      updatedJob.workUnit = body.workUnit === "day" ? "day" : "episode";
    }

    if (body.episodeLabel !== undefined) {
      updatedJob.episodeLabel = body.episodeLabel ? String(body.episodeLabel) : undefined;
    }

    if (body.dayLabel !== undefined) {
      updatedJob.dayLabel = body.dayLabel ? String(body.dayLabel) : undefined;
    }

    if (body.workUnits !== undefined) {
      const workUnits = Number(body.workUnits);
      if (!Number.isFinite(workUnits) || workUnits <= 0) {
        return NextResponse.json({ error: "Số tập/ngày không hợp lệ" }, { status: 400 });
      }
      updatedJob.workUnits = workUnits;
    }

    if (body.ratePerUnit !== undefined) {
      const ratePerUnit = Number(body.ratePerUnit);
      if (!Number.isFinite(ratePerUnit) || ratePerUnit < 0) {
        return NextResponse.json({ error: "Đơn giá không hợp lệ" }, { status: 400 });
      }
      updatedJob.ratePerUnit = ratePerUnit;
    }

    if (body.totalSalary !== undefined) {
      const totalSalary = Number(body.totalSalary);
      if (!Number.isFinite(totalSalary) || totalSalary < 0) {
        return NextResponse.json({ error: "Tổng tiền không hợp lệ" }, { status: 400 });
      }
      updatedJob.totalSalary = totalSalary;
    }

    if (body.unitPrice !== undefined) {
      const unitPrice = Number(body.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "Giá/clip không hợp lệ" }, { status: 400 });
      }
      updatedJob.unitPrice = unitPrice;
    }

    if (body.totalUnits !== undefined) {
      const totalUnits = Number(body.totalUnits);
      const claimedUnits = job.assignments.reduce((sum, assignment) => sum + (assignment.units ?? 1), 0);
      if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
        return NextResponse.json({ error: "Tổng số clip không hợp lệ" }, { status: 400 });
      }
      if (totalUnits < claimedUnits) {
        return NextResponse.json({ error: `Không thể giảm số clip xuống dưới ${claimedUnits} clip đã nhận.` }, { status: 400 });
      }
      updatedJob.totalUnits = totalUnits;
    }

    // Patch a specific assignment's approvedAt
    if (body.assignmentId !== undefined && body.approvedAt !== undefined) {
      updatedJob.assignments = job.assignments.map((a) =>
        a.id === body.assignmentId ? { ...a, approvedAt: body.approvedAt } : a
      );
    }

    if (updatedJob.jobType === "mini") {
      const unitPrice = updatedJob.unitPrice ?? 0;
      const totalUnits = updatedJob.totalUnits ?? job.totalUnits ?? 0;
      updatedJob.totalSalary = unitPrice * totalUnits;
      updatedJob.assignments = updatedJob.assignments.map((assignment) => ({
        ...assignment,
        salaryEarned: unitPrice * (assignment.units ?? 1),
      }));
    } else {
      const totalSalary = body.totalSalary !== undefined
        ? Number(body.totalSalary)
        : updatedJob.ratePerUnit !== undefined && updatedJob.workUnits !== undefined
          ? updatedJob.ratePerUnit * updatedJob.workUnits
          : updatedJob.totalSalary;

      updatedJob.totalSalary = totalSalary;
      updatedJob.assignments = updatedJob.assignments.map((assignment) => ({
        ...assignment,
        salaryEarned: (totalSalary * assignment.percentage) / 100,
      }));
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
