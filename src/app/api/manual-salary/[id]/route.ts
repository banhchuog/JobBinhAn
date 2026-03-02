import { NextRequest, NextResponse } from "next/server";
import { deleteManualEntry } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ok = await deleteManualEntry(id);
    if (!ok) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
