/**
 * The collector dashboard's day-bucketing (Today's Work, Completed Today)
 * is defined against Africa/Cairo per the final spec's §4, regardless of
 * the server's or the browser's local timezone.
 */

const CAIRO_TZ = "Africa/Cairo";

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

/** `YYYY-MM-DD` (a Postgres `date` or `timestamptz`'s date part) → Cairo date string. */
export function toCairoDateString(isoDateOrTimestamp: string): string {
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
