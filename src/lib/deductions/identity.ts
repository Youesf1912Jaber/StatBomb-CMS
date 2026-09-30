import { createHash } from "crypto";
import { normalizeMatchId } from "@/lib/sync/distribution-identity";
import type { DeductionSheetSourceRow } from "@/lib/sync/google-sheets";

export function canonicalizeDeductionText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeDeductionHrCode(value: unknown): string {
  return canonicalizeDeductionText(value).toUpperCase();
}

export function canonicalizeDeductionMatchId(value: unknown): string {
  return normalizeMatchId(value) ?? canonicalizeDeductionText(value);
}

export type DeductionCanonicalFields = {
  match_id: string;
  app: string;
  hr_code: string;
  collector_name: string;
  squad: string;
  side: string;
  half: string;
  timestamp: string;
  event: string;
  comment: string;
  review_date: string;
  link: string;
};

export function canonicalizeDeductionSource(
  row: DeductionSheetSourceRow
): DeductionCanonicalFields {
  return {
    match_id: canonicalizeDeductionMatchId(row.match_id),
    app: canonicalizeDeductionText(row.app),
    hr_code: canonicalizeDeductionHrCode(row.code),
    collector_name: canonicalizeDeductionText(row.collector_name),
    squad: canonicalizeDeductionText(row.squad),
    side: canonicalizeDeductionText(row.side),
    half: canonicalizeDeductionText(row.half),
    timestamp: canonicalizeDeductionText(row.timestamp),
    event: canonicalizeDeductionText(row.event),
    comment: canonicalizeDeductionText(row.comment),
    review_date: canonicalizeDeductionText(row.review_date),
    link: canonicalizeDeductionText(row.link),
  };
}

export function deductionContentFingerprint(fields: DeductionCanonicalFields): string {
  const payload = [
    fields.match_id,
    fields.app,
    fields.hr_code,
    fields.collector_name,
    fields.squad,
    fields.side,
    fields.half,
    fields.timestamp,
    fields.event,
    fields.comment,
    fields.review_date,
    fields.link,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function deductionSourceKey(contentFingerprint: string, occurrenceOrdinal: number): string {
  return `${contentFingerprint}:${occurrenceOrdinal}`;
}

export function deductionSimilarityKey(fields: DeductionCanonicalFields): string {
  return [
    fields.match_id,
    fields.hr_code,
    fields.timestamp,
    fields.event,
    fields.half,
    fields.side,
  ].join("|");
}

export function parseDeductionTimestamp(raw: string): string | null {
  const text = canonicalizeDeductionText(raw);
  if (!text) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) return null;
  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString();
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const hour = Number(dmy[4] ?? "0");
    const minute = Number(dmy[5] ?? "0");
    const second = Number(dmy[6] ?? "0");
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
    }
  }
  return null;
}

export function parseDeductionReviewDate(raw: string): string | null {
  const text = canonicalizeDeductionText(raw);
  if (!text) return null;
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

export type DeductionOccurrence = {
  source_row_number: number;
  fields: DeductionCanonicalFields;
  content_fingerprint: string;
  occurrence_ordinal: number;
  source_key: string;
};

export function buildDeductionOccurrences(rows: DeductionSheetSourceRow[]): DeductionOccurrence[] {
  const ordinalByFingerprint = new Map<string, number>();
  return rows.map((row) => {
    const fields = canonicalizeDeductionSource(row);
    const contentFingerprint = deductionContentFingerprint(fields);
    const occurrenceOrdinal = (ordinalByFingerprint.get(contentFingerprint) ?? 0) + 1;
    ordinalByFingerprint.set(contentFingerprint, occurrenceOrdinal);
    return {
      source_row_number: row.source_row_number,
      fields,
      content_fingerprint: contentFingerprint,
      occurrence_ordinal: occurrenceOrdinal,
      source_key: deductionSourceKey(contentFingerprint, occurrenceOrdinal),
    };
  });
}
