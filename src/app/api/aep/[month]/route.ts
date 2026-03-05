import { NextRequest, NextResponse } from "next/server";
import { getAepClassification, upsertAepClassification } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  try {
    const data = await getAepClassification(month);
    return NextResponse.json(data ?? { expenses: {}, salaryAssignments: {}, manualEntries: {} });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  try {
    const body = await req.json();
    const data = {
      expenses: body.expenses ?? {},
      salaryAssignments: body.salaryAssignments ?? {},
      manualEntries: body.manualEntries ?? {},
    };
    await upsertAepClassification(month, data);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
