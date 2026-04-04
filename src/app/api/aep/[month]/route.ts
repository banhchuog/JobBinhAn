import { NextRequest, NextResponse } from "next/server";
import {
  getAepClassification,
  upsertAepClassification,
  initSchema,
  listAepClassificationSnapshots,
  restoreAepClassificationSnapshot,
  createAepClassificationSnapshot,
} from "@/lib/db";

async function ensureTable() {
  try { await initSchema(); } catch { /* already exists */ }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  try {
    await ensureTable();
    const [data, history] = await Promise.all([
      getAepClassification(month),
      listAepClassificationSnapshots(month),
    ]);

    let nextHistory = history;
    if (data && history.length === 0) {
      await createAepClassificationSnapshot(month, data, "bootstrap");
      nextHistory = await listAepClassificationSnapshots(month);
    }

    return NextResponse.json({
      ...(data ?? { expenses: {}, expenseKeys: {}, salaryAssignments: {}, manualEntries: {} }),
      history: nextHistory,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  try {
    await ensureTable();
    const body = await req.json();
    const data = {
      expenses: body.expenses ?? {},
      expenseKeys: body.expenseKeys ?? {},
      salaryAssignments: body.salaryAssignments ?? {},
      manualEntries: body.manualEntries ?? {},
    };
    await upsertAepClassification(month, data);
    const history = await listAepClassificationSnapshots(month);
    return NextResponse.json({ ok: true, data, history });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  try {
    await ensureTable();
    const body = await req.json();
    const snapshotId = Number(body?.snapshotId);

    if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
      return NextResponse.json({ error: "snapshotId không hợp lệ." }, { status: 400 });
    }

    const restored = await restoreAepClassificationSnapshot(month, snapshotId);
    if (!restored) {
      return NextResponse.json({ error: "Không tìm thấy snapshot để khôi phục." }, { status: 404 });
    }

    const history = await listAepClassificationSnapshots(month);
    return NextResponse.json({ ok: true, data: restored, history });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
