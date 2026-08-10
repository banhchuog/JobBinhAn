import { createHash } from "crypto";

export type CassoPayloadObject = Record<string, unknown>;

export interface StoredCassoTransaction {
  transactionId: string;
  bookingDate: string;
  transactionAt?: string;
  receivedAt?: string;
  amount: number;
  isIncoming: boolean;
  isAep: boolean;
  description: string;
  counterAccountName: string;
  raw: CassoPayloadObject;
}

export const AEP_AMOUNTS = new Set([65_000, 165_000, 270_000, 420_000]);

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9.-]/g, "");
    if (!digits) return null;
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const direct = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (!/[T\s]\d{1,2}:\d{2}/.test(trimmed)) return null;

  const localMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (localMatch) {
    const [, year, month, day, hour, minute, second = "0", millisecond = "0"] = localMatch;
    const utcMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 7,
      Number(minute),
      Number(second),
      Number(millisecond.padEnd(3, "0"))
    );
    return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function getTransactions(payload: unknown): CassoPayloadObject[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is CassoPayloadObject => !!item && typeof item === "object");
  }

  if (!payload || typeof payload !== "object") return [];

  const root = payload as CassoPayloadObject;
  const directTransaction = hasTransactionShape(root) ? [root] : [];

  const candidates = [
    root.data,
    root.record,
    root.records,
    root.transaction,
    root.transactions,
    root.item,
    root.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is CassoPayloadObject => !!item && typeof item === "object");
    }
    if (candidate && typeof candidate === "object") {
      const objectCandidate = candidate as CassoPayloadObject;
      if (hasTransactionShape(objectCandidate)) return [objectCandidate];

      const nested = [
        objectCandidate.records,
        objectCandidate.transactions,
        objectCandidate.items,
        objectCandidate.data,
      ];
      for (const nestedCandidate of nested) {
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate.filter((item): item is CassoPayloadObject => !!item && typeof item === "object");
        }
      }
    }
  }

  return directTransaction;
}

function hasTransactionShape(payload: CassoPayloadObject): boolean {
  return Boolean(
    payload.id ?? payload.transactionId ?? payload.transactionID ?? payload.creditAmount ?? payload.debitAmount ?? payload.amount ?? payload.bookingDate ?? payload.transactionDate
  );
}

export function isIncomingTransaction(tx: CassoPayloadObject): boolean {
  const creditAmount = toNumber(tx.creditAmount);
  const debitAmount = toNumber(tx.debitAmount);
  if ((creditAmount ?? 0) > 0) return true;
  if ((debitAmount ?? 0) > 0) return false;

  const amount = toNumber(tx.amount) ?? toNumber(tx.amountNumber) ?? 0;
  const typeValue = String(tx.type ?? tx.transactionType ?? tx.kind ?? "").toLowerCase();
  if (typeValue.includes("in") || typeValue.includes("credit") || typeValue.includes("deposit")) return true;
  if (typeValue.includes("out") || typeValue.includes("debit") || typeValue.includes("withdraw")) return false;
  return amount > 0;
}

export function getIncomingAmount(tx: CassoPayloadObject): number | null {
  const creditAmount = toNumber(tx.creditAmount);
  if ((creditAmount ?? 0) > 0) return creditAmount;
  const amount = toNumber(tx.amount) ?? toNumber(tx.amountNumber);
  if ((amount ?? 0) > 0) return amount;
  return null;
}

export function getTransactionDate(tx: CassoPayloadObject): string | null {
  return (
    toDateKey(tx.bookingDate) ??
    toDateKey(tx.transactionDate) ??
    toDateKey(tx.when) ??
    toDateKey(tx.createdAt) ??
    toDateKey(tx.date)
  );
}

export function getTransactionTimestamp(tx: CassoPayloadObject): string | null {
  return (
    toIsoTimestamp(tx.transactionDate) ??
    toIsoTimestamp(tx.when) ??
    toIsoTimestamp(tx.createdAt) ??
    toIsoTimestamp(tx.bookingDate) ??
    toIsoTimestamp(tx.date)
  );
}

export function normalizeCassoTransaction(tx: CassoPayloadObject): StoredCassoTransaction | null {
  const isIncoming = isIncomingTransaction(tx);
  const amount = getIncomingAmount(tx);
  const bookingDate = getTransactionDate(tx);
  const transactionAt = getTransactionTimestamp(tx) ?? undefined;

  if (!amount || !bookingDate) return null;

  const description = String(
    tx.description ?? tx.content ?? tx.transferContent ?? tx.remark ?? tx.memo ?? ""
  ).trim();
  const counterAccountName = String(
    tx.counterAccountName ?? tx.corresponsiveName ?? tx.counterPartyName ?? tx.subAccountName ?? ""
  ).trim();

  const sourceId = String(
    tx.id ?? tx.transactionId ?? tx.transactionID ?? tx.referenceCode ?? tx.reference ?? tx.tid ?? ""
  ).trim();

  const transactionId = sourceId || createHash("sha1")
    .update(JSON.stringify({ bookingDate, amount, isIncoming, description, counterAccountName }))
    .digest("hex");

  return {
    transactionId,
    bookingDate,
    transactionAt,
    amount,
    isIncoming,
    isAep: isIncoming && AEP_AMOUNTS.has(amount),
    description,
    counterAccountName,
    raw: tx,
  };
}
