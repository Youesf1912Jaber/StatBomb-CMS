
/**
 * Calendar-date utilities for StatBomb CMS.
 *
 * Date-only values must not be converted through a timezone.
 * Actual timestamps are formatted in Africa/Cairo.
 */

const CAIRO_TZ = "Africa/Cairo";

export type CalendarDateFormat = "iso" | "mdy";

/** Today's date in Africa/Cairo, as YYYY-MM-DD. */
export function getCairoToday(): string {
  return formatInCairo(new Date());
}

/** Formats an actual instant as YYYY-MM-DD in Africa/Cairo. */
export function formatInCairo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

/** Validates and normalizes a calendar date without timezone conversion. */
export function parseCalendarDate(
  value: string,
  format: CalendarDateFormat = "iso",
): string | null {
  const input = value.trim();

  let year: number;
  let month: number;
  let day: number;

  if (format === "iso") {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
    if (!match) return null;

    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    // Explicit US format: M/D/YYYY. Never guess slash-date ordering.
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
    if (!match) return null;

    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  }

  if (!isValidCalendarDate(year, month, day)) return null;

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Converts a date-only ISO value to its normalized calendar date.
 * Timestamp values are converted to the corresponding Cairo date.
 *
 * US slash dates are interpreted explicitly as M/D/YYYY.
 */
export function toCairoDateString(value: string): string {
  const input = value.trim();

  const isoDate = parseCalendarDate(input, "iso");
  if (isoDate) return isoDate;

  const usDate = parseCalendarDate(input, "mdy");
  if (usDate) return usDate;

  // Only timestamps should reach this branch.
  // Reject invalid values instead of silently producing "Invalid Date".
  const timestamp = new Date(input);

  if (Number.isNaN(timestamp.getTime())) {
    throw new RangeError(`Invalid date or timestamp: ${value}`);
  }

  return formatInCairo(timestamp);
}

/** Compares calendar dates after explicit parsing. */
export function calendarDatesEqual(
  left: string,
  right: string,
  format: CalendarDateFormat = "iso",
): boolean {
  const normalizedLeft = parseCalendarDate(left, format);
  const normalizedRight = parseCalendarDate(right, format);

  return (
    normalizedLeft !== null &&
    normalizedRight !== null &&
    normalizedLeft === normalizedRight
  );
}

/** Compares two validated ISO calendar dates. Returns null if invalid. */
export function compareCalendarDates(
  left: string,
  right: string,
): -1 | 0 | 1 | null {
  const normalizedLeft = parseCalendarDate(left, "iso");
  const normalizedRight = parseCalendarDate(right, "iso");

  if (!normalizedLeft || !normalizedRight) return null;
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;

  return 0;
}

/**
 * Human-readable Cairo date + time for actual notification timestamps.
 */
export function formatCairoDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid timestamp: ${isoTimestamp}`);
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
