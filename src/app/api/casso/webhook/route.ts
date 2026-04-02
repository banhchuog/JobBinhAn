import { NextRequest, NextResponse } from "next/server";
import { initSchema, upsertCassoTransactions } from "@/lib/db";
import { getTransactions, normalizeCassoTransaction } from "@/lib/casso";

type WebhookPayload = Record<string, unknown>;

function getProvidedSecret(req: NextRequest, payload?: WebhookPayload): string {
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const bodySecret = payload
    ? String(
        payload.secureToken ??
        payload.secure_token ??
        payload.webhookSecret ??
        payload.webhook_secret ??
        payload.secret ??
        payload.token ??
        payload.apiKey ??
        payload.api_key ??
        ""
      ).trim()
    : "";

  return (
    req.headers.get("x-casso-secure-token")?.trim() ??
    req.headers.get("secure-token")?.trim() ??
    req.headers.get("x-webhook-secret")?.trim() ??
    req.headers.get("x-api-key")?.trim() ??
    req.headers.get("apikey")?.trim() ??
    req.nextUrl.searchParams.get("key")?.trim() ??
    req.nextUrl.searchParams.get("token")?.trim() ??
    req.nextUrl.searchParams.get("secret")?.trim() ??
    bodySecret ??
    auth
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Casso webhook is ready",
    webhookUrl: "/api/casso/webhook",
    expectedSecretEnv: "CASSO_WEBHOOK_SECRET",
  });
}

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = await req.json();

    const expectedSecret = process.env.CASSO_WEBHOOK_SECRET?.trim() ?? "";
    if (!expectedSecret) {
      return NextResponse.json(
        { error: "Chưa cấu hình CASSO_WEBHOOK_SECRET trong Railway" },
        { status: 503 }
      );
    }

    const providedSecret = getProvidedSecret(
      req,
      payload && typeof payload === "object" ? (payload as WebhookPayload) : undefined
    );
    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Sai key bảo mật webhook" }, { status: 401 });
    }

    const transactions = getTransactions(payload)
      .map(normalizeCassoTransaction)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (transactions.length === 0) {
      return NextResponse.json({ ok: true, saved: 0, message: "Không tìm thấy giao dịch hợp lệ trong payload" });
    }

    const saved = await upsertCassoTransactions(transactions);
    const aepMatched = transactions.filter((item) => item.isAep).length;

    return NextResponse.json({ ok: true, saved, aepMatched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
