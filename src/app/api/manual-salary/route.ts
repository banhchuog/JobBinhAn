import { NextRequest, NextResponse } from "next/server";
import { getAllManualEntries, createManualEntry } from "@/lib/db";
import { ManualEntry } from "@/types";

export async function GET() {
  try {
    const entries = await getAllManualEntries();
    return NextResponse.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ManualEntry;
    if (!body.id || !body.empId || !body.month || !body.title || !body.amount) {
      return NextResponse.json({ error: "Thiếu dữ liệu bắt buộc" }, { status: 400 });
    }
    const entry = await createManualEntry({
      id: body.id,
      empId: body.empId,
      month: body.month,
      title: body.title,
      amount: Number(body.amount),
      note: body.note ?? "",
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
