import { NextRequest, NextResponse } from "next/server";
import { getSetting, upsertSetting, initSchema } from "@/lib/db";

async function ensureTable() {
  try { await initSchema(); } catch { /* already exists */ }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  try {
    await ensureTable();
    const data = await getSetting(key);
    return NextResponse.json(data ?? null);
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  try {
    await ensureTable();
    const body = await req.json();
    await upsertSetting(key, body);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
