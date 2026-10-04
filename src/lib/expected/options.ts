import type { ExpectedWeekday } from "./types";

export const EXPECTED_DAILY_VALUES = [
  "1",
  "0.75",
  "0.5",
  "0.25",
  "0",
  "WV",
  "UL",
  "AL-R",
  "AL-C",
  "DS",
  "TP",
  "AB",
  "TA",
  "H",
  "SL",
  "ML",
  "PAT",
  "El",
  "Bl",
] as const;

export type ExpectedDailyValue = (typeof EXPECTED_DAILY_VALUES)[number];

export const EXPECTED_WEEKDAYS: ExpectedWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function isExpectedWeekday(value: string): value is ExpectedWeekday {
  return EXPECTED_WEEKDAYS.includes(value as ExpectedWeekday);
}

export function isExpectedDailyValue(value: string): value is ExpectedDailyValue {
  return (EXPECTED_DAILY_VALUES as readonly string[]).includes(value);
}
