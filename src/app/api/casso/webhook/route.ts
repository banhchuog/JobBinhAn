import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { initSchema, upsertCassoTransactions } from "@/lib/db";
import { getTransactions, normalizeCassoTransaction } from "@/lib/casso";

type WebhookPayload = Record<string, unknown>;

function normalizeSecret(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 1)}***${value.slice(-1)}`;
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeSignature(value: string): string {
  return value.trim().replace(/^sha(1|256|512)=/i, "").trim();
}

function buildSignatureCandidates(rawBody: string, secret: string): string[] {
  const algorithms: Array<"sha1" | "sha256" | "sha512"> = ["sha256", "sha512", "sha1"];
  const candidates = algorithms.flatMap((algorithm) => {
    const hex = createHmac(algorithm, secret).update(rawBody).digest("hex");
    const base64 = createHmac(algorithm, secret).update(rawBody).digest("base64");
    return [hex, base64, `${algorithm}=${hex}`, `${algorithm}=${base64}`, `sha${algorithm.slice(3)}=${hex}`, `sha${algorithm.slice(3)}=${base64}`];
  });
  return Array.from(new Set(candidates.map((candidate) => candidate.trim())));
}

function getProvidedSignature(req: NextRequest): { source: string; value: string } | null {
  const headersToCheck = [
    "x-casso-signature",
    "x-signature",
    "signature",
    "x-webhook-signature",
  ];

  for (const headerName of headersToCheck) {
    const value = req.headers.get(headerName);
    if (value?.trim()) return { source: `header:${headerName}`, value: value.trim() };
  }

  return null;
}

function collectPayloadSecrets(value: unknown, path = "body", depth = 0): Array<{ source: string; value: string }> {
  if (depth > 4 || value == null) return [];
  if (typeof value === "string") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPayloadSecrets(item, `${path}[${index}]`, depth + 1));
  }

  if (typeof value !== "object") return [];

  const entries = Object.entries(value as Record<string, unknown>);
  const ownMatches = entries.flatMap(([key, entryValue]) => {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = normalizeSecret(entryValue);
    const isSecretLike = /(secure|secret|token|api[_-]?key|authorization)/i.test(normalizedKey);
    return isSecretLike && normalizedValue ? [{ source: `${path}.${key}`, value: normalizedValue }] : [];
  });

  const nestedMatches = entries.flatMap(([key, entryValue]) => collectPayloadSecrets(entryValue, `${path}.${key}`, depth + 1));
  return [...ownMatches, ...nestedMatches];
}

function collectProvidedSecrets(req: NextRequest, payload?: WebhookPayload): Array<{ source: string; value: string }> {
  const headerMatches = Array.from(req.headers.entries()).flatMap(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === "authorization") {
      const auth = normalizeSecret(value.replace(/^Bearer\s+/i, ""));
      return auth ? [{ source: `header:${key}`, value: auth }] : [];
    }
    if (!/(secure|secret|token|api[_-]?key)/i.test(normalizedKey)) return [];
    const normalizedValue = normalizeSecret(value);
    return normalizedValue ? [{ source: `header:${key}`, value: normalizedValue }] : [];
  });

  const queryMatches = ["key", "token", "secret", "secureToken", "secure_token"].flatMap((key) => {
    const value = normalizeSecret(req.nextUrl.searchParams.get(key));
    return value ? [{ source: `query:${key}`, value }] : [];
  });

  const bodyMatches = payload ? collectPayloadSecrets(payload) : [];
  return [...headerMatches, ...queryMatches, ...bodyMatches];
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
    const rawBody = await req.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};

    const expectedSecret = process.env.CASSO_WEBHOOK_SECRET?.trim() ?? "";
    if (!expectedSecret) {
      return NextResponse.json(
        { error: "Chưa cấu hình CASSO_WEBHOOK_SECRET trong Railway" },
        { status: 503 }
      );
    }

    const payloadObject = payload && typeof payload === "object" ? (payload as WebhookPayload) : undefined;
    const providedSecrets = collectProvidedSecrets(req, payloadObject);
    const matchedSecret = providedSecrets.find((candidate) => candidate.value === expectedSecret);
    const providedSignature = getProvidedSignature(req);
    const signatureCandidates = providedSignature ? buildSignatureCandidates(rawBody, expectedSecret) : [];
    const matchedSignature = providedSignature
      ? signatureCandidates.find((candidate) => safeEqual(normalizeSignature(candidate), normalizeSignature(providedSignature.value)))
      : null;

    if (!matchedSecret && !matchedSignature) {
      return NextResponse.json(
        {
          error: "Sai key bảo mật webhook",
          debug: {
            sources: providedSecrets.map((candidate) => ({
              source: candidate.source,
              value: maskSecret(candidate.value),
            })),
            signature: providedSignature
              ? {
                  source: providedSignature.source,
                  value: maskSecret(providedSignature.value),
                  length: providedSignature.value.length,
                }
              : null,
            headerNames: Array.from(req.headers.keys()),
          },
        },
        { status: 401 }
      );
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
