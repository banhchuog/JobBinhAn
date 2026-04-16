import { NextResponse } from "next/server";
import { getAllEmployees, createEmployee, initSchema } from "@/lib/db";
import { Employee } from "@/types";

export async function GET() {
  try {
    await initSchema();
    return NextResponse.json(await getAllEmployees());
  } catch {
    return NextResponse.json({ error: "Không thể đọc dữ liệu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await initSchema();
    const body = await req.json();
    const employee: Employee = {
      id: Math.random().toString(36).substring(7),
      name: body.name,
      balance: 0,
    };
    return NextResponse.json(await createEmployee(employee), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Không thể tạo nhân viên" }, { status: 500 });
  }
}
