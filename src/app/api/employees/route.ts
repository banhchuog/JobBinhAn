import { NextResponse } from "next/server";
import { getAllEmployees, createEmployee } from "@/lib/db";
import { Employee } from "@/types";

export async function GET() {
  try {
    return NextResponse.json(getAllEmployees());
  } catch {
    return NextResponse.json({ error: "Không thể đọc dữ liệu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const employee: Employee = {
      id: Math.random().toString(36).substring(7),
      name: body.name,
      balance: 0,
    };
    return NextResponse.json(createEmployee(employee), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Không thể tạo nhân viên" }, { status: 500 });
  }
}
