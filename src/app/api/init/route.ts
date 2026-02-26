import { NextResponse } from "next/server";
import { initSchema } from "@/lib/db";

export async function GET() {
  try {
    await initSchema();
    return NextResponse.json({ ok: true, message: "Database schema initialized successfully!" });
  } catch (error) {
    console.error("Init schema error:", error);
    return NextResponse.json({ error: "Failed to initialize schema" }, { status: 500 });
  }
}
