import { createHash } from "crypto";
import {
  canonicalizeDeductionHrCode,
  canonicalizeDeductionMatchId,
  canonicalizeDeductionText,
  parseDeductionReviewDate,
  parseDeductionTimestamp,
} from "@/lib/deductions/identity";
import type { FfShotSheetSourceRow } from "@/lib/sync/google-sheets";

export {
  canonicalizeDeductionHrCode as canonicalizeFfShotHrCode,
  canonicalizeDeductionMatchId as canonicalizeFfShotMatchId,
  canonicalizeDeductionText as canonicalizeFfShotText,
  parseDeductionReviewDate as parseFfShotReviewDate,
  parseDeductionTimestamp as parseFfShotTimestamp,
};

export type FfShotCanonicalFields = {
  match_id: string;
  app: string;
  hr_code: string;
  collector_name: string;
  squad: string;
  side: string;
  half: string;
  timestamp: string;
  player_id: string;
  review_date: string;
  comment: string;
  link: string;
  correct_collector: string;
  changed: string;
};

export function canonicalizeFfShotSource(row: FfShotSheetSourceRow): FfShotCanonicalFields {
  return {
    match_id: canonicalizeDeductionMatchId(row.match_id),
    app: canonicalizeDeductionText(row.app),
    hr_code: canonicalizeDeductionHrCode(row.code),
    collector_name: canonicalizeDeductionText(row.collector_name),
    squad: canonicalizeDeductionText(row.squad),
    side: canonicalizeDeductionText(row.side),
    half: canonicalizeDeductionText(row.half),
    timestamp: canonicalizeDeductionText(row.timestamp),
    player_id: canonicalizeDeductionText(row.player_id),
    review_date: canonicalizeDeductionText(row.review_date),
    comment: canonicalizeDeductionText(row.comment),
    link: canonicalizeDeductionText(row.link),
    correct_collector: canonicalizeDeductionText(row.correct_collector),
    changed: canonicalizeDeductionText(row.changed),
  };
}

export function ffShotContentFingerprint(fields: FfShotCanonicalFields): string {
  const payload = [
    fields.match_id,
    fields.app,
    fields.hr_code,
    fields.collector_name,
    fields.squad,
    fields.side,
    fields.half,
    fields.timestamp,
    fields.player_id,
    fields.review_date,
    fields.comment,
    fields.link,
    fields.correct_collector,
    fields.changed,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function ffShotSourceKey(contentFingerprint: string, occurrenceOrdinal: number): string {
  return `${contentFingerprint}:${occurrenceOrdinal}`;
}

export function ffShotSimilarityKey(fields: FfShotCanonicalFields): string {
  return [
    fields.match_id,
    fields.hr_code,
    fields.timestamp,
    fields.player_id,
    fields.half,
    fields.side,
  ].join("|");
}

export type FfShotOccurrence = {
  source_row_number: number;
  fields: FfShotCanonicalFields;
  content_fingerprint: string;
  occurrence_ordinal: number;
  source_key: string;
};

export function buildFfShotOccurrences(rows: FfShotSheetSourceRow[]): FfShotOccurrence[] {
  const ordinalByFingerprint = new Map<string, number>();
  return rows.map((row) => {
    const fields = canonicalizeFfShotSource(row);
    const contentFingerprint = ffShotContentFingerprint(fields);
    const occurrenceOrdinal = (ordinalByFingerprint.get(contentFingerprint) ?? 0) + 1;
    ordinalByFingerprint.set(contentFingerprint, occurrenceOrdinal);
    return {
      source_row_number: row.source_row_number,
      fields,
      content_fingerprint: contentFingerprint,
      occurrence_ordinal: occurrenceOrdinal,
      source_key: ffShotSourceKey(contentFingerprint, occurrenceOrdinal),
    };
  });
}
