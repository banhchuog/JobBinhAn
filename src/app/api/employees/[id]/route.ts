import { NextResponse } from "next/server";
import { getEmployeeById, updateEmployee, deleteEmployee } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const employee = await getEmployeeById(id);
    if (!employee) return NextResponse.json({ error: "Không tìm thấy nhân viên" }, { status: 404 });
    const updated = await updateEmployee({ ...employee, name: body.name ?? employee.name });
    return NextResponse.json(updated);
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
    const ok = await deleteEmployee(id);
    if (!ok) return NextResponse.json({ error: "Không tìm thấy nhân viên" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 });
  }
}
