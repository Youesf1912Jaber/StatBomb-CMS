/**
 * Calendar-date utilities for StatBomb CMS.
 *
 * Date-only values must not be converted through a timezone.
 * Actual timestamps are formatted in Africa/Cairo.
 *
 * Date-only values are normalized to validated `YYYY-MM-DD` calendar strings
 * for comparisons. Slash dates from Distribution are MDY (`M/D/YYYY`).
 * Date-only parsing never uses `Date.parse` / `new Date("M/D/YYYY")`.
 */

const CAIRO_TZ = "Africa/Cairo";

export type CalendarDateFormat = "iso" | "mdy";
export type SlashDateOrder = "mdy" | "dmy";

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** True only for a real Gregorian calendar day (rejects 2/30, month 13, etc.). */
export function isValidCalendarYmd(year: number, month: number, day: number): boolean {
  return isValidCalendarDate(year, month, day);
}

export function formatCalendarYmd(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) return null;
  return `${year.toString().padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

function parseIsoCalendarDate(input: string): string | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(input);
  if (!match) return null;
  return formatCalendarYmd(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseSlashCalendarDate(input: string, order: SlashDateOrder): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(input);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  if (order === "mdy") {
    return formatCalendarYmd(year, first, second);
  }
  return formatCalendarYmd(year, second, first);
}

/**
 * Validates and normalizes a calendar date without timezone conversion.
 *
 * `iso` accepts only `YYYY-MM-DD` (never guesses slash order).
 * `mdy` accepts ISO first, then explicit US `M/D/YYYY`.
 * `dmy` accepts ISO first, then `D/M/YYYY`.
 */
export function parseCalendarDate(
  value: string | null | undefined,
  format: CalendarDateFormat | SlashDateOrder = "iso",
): string | null {
  const input = value?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!input) return null;

  if (format === "iso") {
    return parseIsoCalendarDate(input);
  }

  return parseIsoCalendarDate(input) ?? parseSlashCalendarDate(input, format);
}

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

  const timestamp = new Date(input);

  if (Number.isNaN(timestamp.getTime())) {
    throw new RangeError(`Invalid date or timestamp: ${value}`);
  }

  return formatInCairo(timestamp);
}

/** Compares calendar dates after explicit parsing. */
export function calendarDatesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
  format: CalendarDateFormat | SlashDateOrder = "iso",
): boolean {
  const normalizedLeft = parseCalendarDate(left, format);
  const normalizedRight = parseCalendarDate(right, format);

  return (
    normalizedLeft !== null &&
    normalizedRight !== null &&
    normalizedLeft === normalizedRight
  );
}

/** Compares two calendar dates after parsing. Returns null if invalid. */
export function compareCalendarDates(
  left: string | null | undefined,
  right: string | null | undefined,
  format: CalendarDateFormat | SlashDateOrder = "iso",
): -1 | 0 | 1 | null {
  const normalizedLeft = parseCalendarDate(left, format);
  const normalizedRight = parseCalendarDate(right, format);

  if (!normalizedLeft || !normalizedRight) return null;
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;

  return 0;
}

/** Current Shift / Today's Work: same calendar day, ISO or MDY. */
export function isCurrentShiftDate(
  shiftDate: string | null | undefined,
  todayIso: string,
): boolean {
  return calendarDatesEqual(shiftDate, todayIso, "mdy");
}

/** Upcoming: shift_date is a real calendar day strictly after today. */
export function isUpcomingShiftDate(
  shiftDate: string | null | undefined,
  todayIso: string,
): boolean {
  const cmp = compareCalendarDates(shiftDate, todayIso, "mdy");
  return cmp !== null && cmp > 0;
}

export function isOnOrAfterCalendarDate(
  date: string | null | undefined,
  todayIso: string,
): boolean {
  const cmp = compareCalendarDates(date, todayIso, "mdy");
  return cmp !== null && cmp >= 0;
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
