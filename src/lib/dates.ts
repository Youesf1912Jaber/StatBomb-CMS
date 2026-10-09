/**
 * The collector dashboard's day-bucketing (Today's Work, Completed Today)
 * is defined against Africa/Cairo per the final spec's §4, regardless of
 * the server's or the browser's local timezone.
 *
 * Date-only values are normalized to validated `YYYY-MM-DD` calendar strings
 * for comparisons. Slash dates from Distribution are MDY (`M/D/YYYY`).
 * Date-only parsing never uses `Date.parse` / `new Date("M/D/YYYY")`.
 */

const CAIRO_TZ = "Africa/Cairo";

export type SlashDateOrder = "mdy" | "dmy";

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** True only for a real Gregorian calendar day (rejects 2/30, month 13, etc.). */
export function isValidCalendarYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatCalendarYmd(year: number, month: number, day: number): string | null {
  if (!isValidCalendarYmd(year, month, day)) return null;
  return `${year.toString().padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Parse a date-only value to validated `YYYY-MM-DD`.
 * ISO `YYYY-MM-DD` is always accepted. Slash dates use `slashOrder`
 * (`mdy` = Distribution / Over Target `M/D/YYYY`).
 */
export function parseCalendarDate(
  value: string | null | undefined,
  slashOrder: SlashDateOrder = "mdy",
): string | null {
  const text = value?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (iso) {
    return formatCalendarYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);
    if (slashOrder === "mdy") {
      return formatCalendarYmd(year, first, second);
    }
    return formatCalendarYmd(year, second, first);
  }

  return null;
}

export function calendarDatesEqual(
  left: string | null | undefined,
  right: string | null | undefined,
  slashOrder: SlashDateOrder = "mdy",
): boolean {
  const a = parseCalendarDate(left, slashOrder);
  const b = parseCalendarDate(right, slashOrder);
  return a !== null && b !== null && a === b;
}

export function compareCalendarDates(
  left: string | null | undefined,
  right: string | null | undefined,
  slashOrder: SlashDateOrder = "mdy",
): number | null {
  const a = parseCalendarDate(left, slashOrder);
  const b = parseCalendarDate(right, slashOrder);
  if (a === null || b === null) return null;
  if (a < b) return -1;
  if (a > b) return 1;
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

/** Today's date in Africa/Cairo, as `YYYY-MM-DD` (matches Postgres `date`). */
export function getCairoToday(): string {
  return formatInCairo(new Date());
}

/** Formats any Date as `YYYY-MM-DD` in Africa/Cairo. */
export function formatInCairo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAIRO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * `YYYY-MM-DD` (a Postgres `date`) is returned as that civil day.
 * Timestamptz values are converted to Africa/Cairo.
 */
export function toCairoDateString(isoDateOrTimestamp: string): string {
  const trimmed = isoDateOrTimestamp.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseCalendarDate(trimmed) ?? trimmed;
  }
  return formatInCairo(new Date(isoDateOrTimestamp));
}

/**
 * Human-readable Cairo date + time (e.g. "16 Sep 2026, 6:30 PM") for
 * notification timestamps. Same Africa/Cairo anchoring as the rest of the app.
 */
export function formatCairoDateTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CAIRO_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoTimestamp));
}
