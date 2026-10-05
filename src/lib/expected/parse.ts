import type {
  ExpectedCollectorRow,
  ExpectedColumnMap,
  ExpectedSheetCell,
  ExpectedSummaryEntry,
  ExpectedSummaryKey,
  ExpectedWeekBlock,
  ExpectedWeekday,
  ExpectedWeekSummary,
} from "./types";

const WEEKDAYS: ExpectedWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DAY_HEADER_ALIASES: Record<ExpectedWeekday, string[]> = {
  sunday: ["sunday", "sun"],
  monday: ["monday", "mon"],
  tuesday: ["tuesday", "tue", "tues"],
  wednesday: ["wednesday", "wed"],
  thursday: ["thursday", "thu", "thur", "thurs"],
  friday: ["friday", "fri"],
  saturday: ["saturday", "sat"],
};

const SUMMARY_ALIASES: Array<[ExpectedSummaryKey, string[]]> = [
  ["total_shift_expected_before", ["total shift expected before", "total shifts expected before"]],
  ["expected_matches_before_week", ["expected matches before week", "expected match before week"]],
  ["completed_end_of_week", ["completed end of the week", "completed end of week"]],
  ["actual_shifts_end_of_week", ["actual shifts end of the week", "actual shift end of the week", "actual shifts end of week"]],
  ["total_shifts_all_team", ["total shifts all team", "total shift all team", "total shifts"]],
  ["expected_shift_matches", ["expected shift matches", "expected shifts matches", "expected shift match"]],
  ["total_absence", ["total absence", "total absences"]],
  ["over_target", ["over target"]],
  ["al_r", ["al r", "alr"]],
  ["al_c", ["al c", "alc"]],
  ["sl", ["sl", "sick leave"]],
  ["ul", ["ul", "unpaid leave"]],
  ["h", ["h", "holiday"]],
  ["diff", ["diff", "difference"]],
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function cellText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value)
    .toLowerCase()
    .replace(/[_./]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function columnLetter(index: number): string {
  if (index < 0) return "";
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function makeCell(rowIndex: number, column: number, value: unknown): ExpectedSheetCell {
  return {
    row: rowIndex + 1,
    column,
    column_letter: columnLetter(column),
    value: cellText(value),
  };
}

function cellAt(matrix: unknown[][], rowIndex: number, column: number): ExpectedSheetCell {
  const row = matrix[rowIndex] ?? [];
  return makeCell(rowIndex, column, column >= 0 ? row[column] : "");
}

function validIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function expandYear(year: number): number {
  if (year < 100) return year + 2000;
  return year;
}

export function parseSheetDate(raw: string, fallbackYear?: number): string | null {
  const text = cellText(raw);
  if (!text) return null;

  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) return validIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const year = expandYear(Number(dmy[3]));
    if (first > 12 && second <= 12) return validIso(year, second, first);
    if (second > 12 && first <= 12) return validIso(year, first, second);
    return validIso(year, second, first);
  }

  const dayMonthName = text.match(/^(\d{1,2})[ \-/.]+([A-Za-z]+)(?:[ \-/.,]+(\d{2,4}))?$/);
  if (dayMonthName) {
    const month = MONTHS[dayMonthName[2]?.toLowerCase() ?? ""];
    const year = dayMonthName[3] ? expandYear(Number(dayMonthName[3])) : fallbackYear;
    if (month && year) return validIso(year, month, Number(dayMonthName[1]));
  }

  const monthNameDay = text.match(/^([A-Za-z]+)[ \-/.]+(\d{1,2}),?[ \-/]+(\d{2,4})$/);
  if (monthNameDay) {
    const month = MONTHS[monthNameDay[1]?.toLowerCase() ?? ""];
    if (month) return validIso(expandYear(Number(monthNameDay[3])), month, Number(monthNameDay[2]));
  }

  const dayMonth = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (dayMonth && fallbackYear) {
    const first = Number(dayMonth[1]);
    const second = Number(dayMonth[2]);
    if (first > 12 && second <= 12) return validIso(fallbackYear, second, first);
    if (second > 12 && first <= 12) return validIso(fallbackYear, first, second);
    return validIso(fallbackYear, second, first);
  }

  const dayNameMonth = text.match(/^(\d{1,2})[ \-/.]+([A-Za-z]+)$/);
  if (dayNameMonth && fallbackYear) {
    const month = MONTHS[dayNameMonth[2]?.toLowerCase() ?? ""];
    if (month) return validIso(fallbackYear, month, Number(dayNameMonth[1]));
  }

  return null;
}

function extractDatesFromText(raw: string, fallbackYear?: number): string[] {
  const text = cellText(raw);
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | null) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  const whole = parseSheetDate(text, fallbackYear);
  if (whole) {
    push(whole);
    return found;
  }

  const chunks = text.split(/\s*(?:[-–—]|to|until|through)\s*/i);
  if (chunks.length >= 2) {
    for (const chunk of chunks) push(parseSheetDate(chunk, fallbackYear));
    if (found.length >= 2) return found;
  }

  const matches = text.match(
    /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[ \-/.]+[A-Za-z]+(?:[ \-/.,]+\d{2,4})?|[A-Za-z]+[ \-/.]+\d{1,2},?[ \-/]+\d{2,4}/g
  );
  if (matches) {
    for (const match of matches) push(parseSheetDate(match, fallbackYear));
  }
  return found;
}

function toSunday(iso: string): string {
  const parts = iso.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function toSaturday(sundayIso: string): string {
  const parts = sundayIso.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day + 6));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayOfIso(iso: string): ExpectedWeekday {
  const parts = iso.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAYS[date.getUTCDay()] ?? "sunday";
}

function looksLikeTime(text: string): boolean {
  return (
    /\d{1,2}\s*:\s*\d{2}/.test(text) ||
    /\d{1,2}\s*(?:am|pm)\b/i.test(text)
  );
}

function extractTime(text: string): string | null {
  const match = text.match(
    /\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:[-–—]|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i
  );
  if (match?.[0]) return cellText(match[0]);
  const single = text.match(/\d{1,2}\s*:\s*\d{2}(?:\s*(?:am|pm))?/i);
  return single?.[0] ? cellText(single[0]) : null;
}

function matchShiftLabel(raw: string): { name: string; time: string | null } | null {
  const text = cellText(raw);
  if (!text) return null;
  if (/^all$/i.test(text)) return { name: "All", time: extractTime(text) };
  const match = text.match(/^(morning|overnight|night)\s*([12])\b/i);
  const kind = match?.[1];
  const number = match?.[2];
  if (!kind || !number) return null;
  const label = kind.toLowerCase() === "morning" ? "Morning" : kind.toLowerCase() === "overnight" ? "Overnight" : "Night";
  return { name: `${label} ${number}`, time: extractTime(text) };
}

function emptyDailyShifts(value: string | null = null): Record<ExpectedWeekday, string | null> {
  return {
    sunday: value,
    monday: value,
    tuesday: value,
    wednesday: value,
    thursday: value,
    friday: value,
    saturday: value,
  };
}

function readDailyShiftsFromRow(
  matrix: unknown[][],
  rowIndex: number,
  columns: ExpectedColumnMap
): { hits: number; shifts: Record<ExpectedWeekday, string | null> } {
  const shifts = emptyDailyShifts(null);
  let hits = 0;
  const row = matrix[rowIndex] ?? [];
  for (const day of WEEKDAYS) {
    const matched = matchShiftLabel(cellText(row[columns.days[day]]));
    if (!matched) continue;
    shifts[day] = matched.name;
    hits += 1;
  }
  return { hits, shifts };
}

function fillForwardDailyShifts(
  shifts: Record<ExpectedWeekday, string | null>
): Record<ExpectedWeekday, string | null> {
  const filled = emptyDailyShifts(null);
  let last: string | null = null;
  for (const day of WEEKDAYS) {
    if (shifts[day]) last = shifts[day];
    filled[day] = shifts[day] ?? last;
  }
  return filled;
}

function resolveDailyShifts(
  matrix: unknown[][],
  startIndex: number,
  dateRowIndex: number,
  columns: ExpectedColumnMap,
  weekShiftName: string | null
): Record<ExpectedWeekday, string | null> {
  let best: Record<ExpectedWeekday, string | null> | null = null;
  let bestHits = 0;
  for (let rowIndex = dateRowIndex - 1; rowIndex >= startIndex; rowIndex -= 1) {
    const row = matrix[rowIndex] ?? [];
    if (isHeaderRow(row) || isEmptyRow(row) || isWeekFooterRow(row, columns)) continue;
    const { hits, shifts } = readDailyShiftsFromRow(matrix, rowIndex, columns);
    if (hits > bestHits) {
      best = shifts;
      bestHits = hits;
      if (hits >= WEEKDAYS.length) break;
    }
  }
  if (best && bestHits > 0) return fillForwardDailyShifts(best);
  return emptyDailyShifts(weekShiftName);
}

function readDayDatesFromRow(
  matrix: unknown[][],
  rowIndex: number,
  columns: ExpectedColumnMap,
  fallbackYear?: number
): Partial<Record<ExpectedWeekday, ExpectedSheetCell>> {
  const row = matrix[rowIndex] ?? [];
  const dayDates: Partial<Record<ExpectedWeekday, ExpectedSheetCell>> = {};
  for (const day of WEEKDAYS) {
    const column = columns.days[day];
    const cell = makeCell(rowIndex, column, row[column]);
    const date = parseSheetDate(cell.value, fallbackYear);
    if (date) dayDates[day] = { ...cell, value: date };
  }
  return dayDates;
}

function addDaysIso(iso: string, days: number): string | null {
  const parts = iso.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function completeWeekDates(
  dayDates: Partial<Record<ExpectedWeekday, ExpectedSheetCell>>
): { sunday: ExpectedSheetCell; saturday: ExpectedSheetCell; startDate: string; endDate: string } | null {
  const sunday = dayDates.sunday;
  const saturday = dayDates.saturday;
  if (!sunday?.value || !saturday?.value) return null;
  if (weekdayOfIso(sunday.value) !== "sunday") return null;
  if (weekdayOfIso(saturday.value) !== "saturday") return null;
  for (let offset = 0; offset < WEEKDAYS.length; offset += 1) {
    const day = WEEKDAYS[offset];
    if (!day) return null;
    const cell = dayDates[day];
    const expected = addDaysIso(sunday.value, offset);
    if (!cell?.value || !expected || cell.value !== expected) return null;
    if (weekdayOfIso(cell.value) !== day) return null;
  }
  return { sunday, saturday, startDate: sunday.value, endDate: saturday.value };
}

function findColumnIndex(headers: string[], ...aliases: string[]): number {
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (header && aliases.includes(header)) return index;
  }
  return -1;
}

function matchDayHeader(header: string): ExpectedWeekday | null {
  for (const day of WEEKDAYS) {
    if (DAY_HEADER_ALIASES[day].includes(header)) return day;
  }
  return null;
}

function isHeaderRow(row: unknown[]): boolean {
  const headers = row.map(normalizeHeader);
  const hrCode = findColumnIndex(headers, "hr code", "hrcode");
  const collector = findColumnIndex(headers, "collector", "collector name");
  const type = findColumnIndex(headers, "type", "shift type", "collector type");
  return hrCode >= 0 && collector >= 0 && type >= 0;
}

function resolveColumns(headerRow: unknown[], fallbackYear?: number): ExpectedColumnMap | null {
  const headers = headerRow.map(normalizeHeader);
  const hrCode = findColumnIndex(headers, "hr code", "hrcode");
  const collector = findColumnIndex(headers, "collector", "collector name");
  const type = findColumnIndex(headers, "type", "shift type", "collector type");
  if (hrCode < 0 || collector < 0 || type < 0) return null;

  const days = {
    sunday: -1,
    monday: -1,
    tuesday: -1,
    wednesday: -1,
    thursday: -1,
    friday: -1,
    saturday: -1,
  } as Record<ExpectedWeekday, number>;

  for (let index = 0; index < headerRow.length; index += 1) {
    if (index === hrCode || index === collector || index === type) continue;
    const header = headers[index] ?? "";
    const named = matchDayHeader(header);
    if (named && days[named] < 0) {
      days[named] = index;
      continue;
    }
    const asDate = parseSheetDate(cellText(headerRow[index]), fallbackYear);
    if (asDate && days[weekdayOfIso(asDate)] < 0) {
      days[weekdayOfIso(asDate)] = index;
    }
  }

  const missingDays = WEEKDAYS.filter((day) => days[day] < 0);
  if (missingDays.length > 0) {
    let cursor = type + 1;
    for (const day of WEEKDAYS) {
      if (days[day] >= 0) continue;
      while (cursor === hrCode || cursor === collector || cursor === type) cursor += 1;
      days[day] = cursor;
      cursor += 1;
    }
  }

  let countM1 = findColumnIndex(headers, "count m1", "countm1");
  let sumM1 = findColumnIndex(headers, "sum m1", "summ1");
  let actualM1 = findColumnIndex(headers, "actual m1", "actualm1");
  const saturday = days.saturday;
  if (countM1 < 0) countM1 = saturday + 1;
  if (sumM1 < 0) sumM1 = saturday + 2;
  if (actualM1 < 0) actualM1 = saturday + 3;

  return {
    hr_code: hrCode,
    collector,
    type,
    days,
    count_m1: countM1,
    sum_m1: sumM1,
    actual_m1: actualM1,
    summary_start: Math.max(countM1, sumM1, actualM1, saturday) + 1,
  };
}

function rowHasLeftContent(row: unknown[], columns: ExpectedColumnMap): boolean {
  const indexes = [
    columns.hr_code,
    columns.collector,
    columns.type,
    ...WEEKDAYS.map((day) => columns.days[day]),
    columns.count_m1,
    columns.sum_m1,
    columns.actual_m1,
  ];
  return indexes.some((index) => index >= 0 && cellText(row[index]) !== "");
}

function isEmptyRow(row: unknown[] | undefined): boolean {
  if (!row) return true;
  return row.every((value) => cellText(value) === "");
}

function collectorKey(value: string): string {
  return normalizeHeader(value);
}

function isWeekFooterLabel(value: string): boolean {
  const normalized = normalizeHeader(value);
  return (
    normalized === "count m1" ||
    normalized === "countm1" ||
    normalized === "sum m1" ||
    normalized === "summ1" ||
    normalized === "actual m1" ||
    normalized === "actualm1"
  );
}

function isWeekFooterRow(row: unknown[], columns: ExpectedColumnMap): boolean {
  const indexes = [
    columns.hr_code,
    columns.collector,
    columns.type,
    ...WEEKDAYS.map((day) => columns.days[day]),
    columns.count_m1,
    columns.sum_m1,
    columns.actual_m1,
  ];
  return indexes.some((index) => index >= 0 && isWeekFooterLabel(cellText(row[index])));
}

function looksLikeCollectorRow(row: unknown[], columns: ExpectedColumnMap): boolean {
  if (isHeaderRow(row)) return false;
  if (isWeekFooterRow(row, columns)) return false;
  const hrCode = cellText(row[columns.hr_code]);
  const collector = cellText(row[columns.collector]);
  const type = cellText(row[columns.type]);
  const key = collectorKey(collector);
  if (!hrCode && (key === "total" || key === "sum" || key === "count")) return false;
  if (isWeekFooterLabel(hrCode) || isWeekFooterLabel(collector) || isWeekFooterLabel(type)) return false;
  if (matchShiftLabel(hrCode) || matchShiftLabel(collector) || matchShiftLabel(type)) return false;
  const datedDays = WEEKDAYS.filter((day) => parseSheetDate(cellText(row[columns.days[day]])));
  if (datedDays.length >= 5 && !hrCode) return false;
  if (hrCode) return true;
  if (collector && type) return true;
  if (collector && WEEKDAYS.some((day) => cellText(row[columns.days[day]]) !== "")) return true;
  return false;
}

function mapCollectorRow(
  matrix: unknown[][],
  rowIndex: number,
  columns: ExpectedColumnMap
): ExpectedCollectorRow {
  const days = {
    sunday: cellAt(matrix, rowIndex, columns.days.sunday),
    monday: cellAt(matrix, rowIndex, columns.days.monday),
    tuesday: cellAt(matrix, rowIndex, columns.days.tuesday),
    wednesday: cellAt(matrix, rowIndex, columns.days.wednesday),
    thursday: cellAt(matrix, rowIndex, columns.days.thursday),
    friday: cellAt(matrix, rowIndex, columns.days.friday),
    saturday: cellAt(matrix, rowIndex, columns.days.saturday),
  } as Record<ExpectedWeekday, ExpectedSheetCell>;

  return {
    row_number: rowIndex + 1,
    hr_code: cellAt(matrix, rowIndex, columns.hr_code),
    collector: cellAt(matrix, rowIndex, columns.collector),
    type: cellAt(matrix, rowIndex, columns.type),
    days,
    count_m1: cellAt(matrix, rowIndex, columns.count_m1),
    sum_m1: cellAt(matrix, rowIndex, columns.sum_m1),
    actual_m1: cellAt(matrix, rowIndex, columns.actual_m1),
  };
}

function matchSummaryKey(label: string): ExpectedSummaryKey | null {
  const normalized = normalizeHeader(label);
  if (!normalized) return null;
  for (const [key, aliases] of SUMMARY_ALIASES) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

function emptySummary(): ExpectedWeekSummary {
  return {
    al_r: null,
    ul: null,
    al_c: null,
    h: null,
    sl: null,
    total_absence: null,
    total_shifts_all_team: null,
    expected_shift_matches: null,
    over_target: null,
    total_shift_expected_before: null,
    expected_matches_before_week: null,
    completed_end_of_week: null,
    actual_shifts_end_of_week: null,
    diff: null,
    extras: [],
  };
}

function isNumericLike(value: string): boolean {
  return /^-?\d+(?:[.,]\d+)?%?$/.test(value);
}

function summaryValueCell(
  matrix: unknown[][],
  rowIndex: number,
  column: number,
  endRowIndex: number
): ExpectedSheetCell {
  const right = cellAt(matrix, rowIndex, column + 1);
  if (right.value !== "" && matchSummaryKey(right.value) === null) return right;
  if (rowIndex + 1 <= endRowIndex) {
    const below = cellAt(matrix, rowIndex + 1, column);
    if (below.value !== "" && matchSummaryKey(below.value) === null && !isHeaderRow(matrix[rowIndex + 1] ?? [])) {
      return below;
    }
  }
  return right;
}

function rowHasSummaryLabel(row: unknown[], summaryStart: number): boolean {
  for (let column = summaryStart; column < row.length; column += 1) {
    if (matchSummaryKey(cellText(row[column]))) return true;
  }
  return false;
}

function parseSummary(
  matrix: unknown[][],
  headerIndex: number,
  endRowIndex: number,
  summaryStart: number
): ExpectedWeekSummary {
  const summary = emptySummary();
  const extras: ExpectedSummaryEntry[] = [];
  const used = new Set<string>();

  for (let rowIndex = headerIndex; rowIndex <= endRowIndex; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const lastColumn = Math.max(row.length - 1, summaryStart);
    for (let column = summaryStart; column <= lastColumn; column += 1) {
      const label = cellAt(matrix, rowIndex, column);
      if (!label.value || isNumericLike(label.value)) continue;
      const key = matchSummaryKey(label.value);
      const value = summaryValueCell(matrix, rowIndex, column, endRowIndex);
      const consumed = `${value.row}:${value.column}`;
      if (key) {
        if (summary[key] === null) summary[key] = value;
        used.add(consumed);
        continue;
      }
      if (value.value === "" || matchSummaryKey(value.value) !== null) continue;
      if (used.has(consumed)) continue;
      if (label.value.length > 80) continue;
      extras.push({ key: normalizeHeader(label.value), label, value });
      used.add(consumed);
    }
  }

  summary.extras = extras;
  return summary;
}

function firstYearInRows(matrix: unknown[][], start: number, end: number): number | undefined {
  for (let rowIndex = start; rowIndex <= end; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    for (const value of row) {
      const dates = extractDatesFromText(cellText(value));
      const first = dates[0];
      if (first) return Number(first.slice(0, 4));
    }
  }
  return undefined;
}

function parseMetadata(
  matrix: unknown[][],
  startIndex: number,
  headerIndex: number,
  endIndex: number,
  columns: ExpectedColumnMap,
  fallbackYear?: number
): {
  shift_name: string | null;
  shift_name_cell: ExpectedSheetCell | null;
  shift_time: string | null;
  shift_time_cell: ExpectedSheetCell | null;
  week_start_cell: ExpectedSheetCell | null;
  week_end_cell: ExpectedSheetCell | null;
  week_start_date: string | null;
  week_end_date: string | null;
  daily_shifts: Record<ExpectedWeekday, string | null>;
} {
  let dayDates = readDayDatesFromRow(matrix, headerIndex, columns, fallbackYear);
  let dateRowIndex = headerIndex;
  let complete = completeWeekDates(dayDates);
  if (!complete) {
    for (let rowIndex = headerIndex - 1; rowIndex >= startIndex; rowIndex -= 1) {
      const candidate = readDayDatesFromRow(matrix, rowIndex, columns, fallbackYear);
      const candidateComplete = completeWeekDates(candidate);
      if (candidateComplete) {
        dayDates = candidate;
        dateRowIndex = rowIndex;
        complete = candidateComplete;
        break;
      }
    }
  }
  if (!complete) {
    const belowLimit = Math.min(endIndex, headerIndex + 8);
    for (let rowIndex = headerIndex + 1; rowIndex <= belowLimit; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      if (isHeaderRow(row) || isWeekFooterRow(row, columns)) break;
      const candidate = readDayDatesFromRow(matrix, rowIndex, columns, fallbackYear);
      const candidateComplete = completeWeekDates(candidate);
      if (candidateComplete) {
        dayDates = candidate;
        dateRowIndex = rowIndex;
        complete = candidateComplete;
        break;
      }
    }
  }

  const sundayCell = complete?.sunday ?? null;
  const saturdayCell = complete?.saturday ?? null;
  const startDate = complete?.startDate ?? null;
  const endDate = complete?.endDate ?? null;

  let shiftName: ExpectedSheetCell | null = null;
  let shiftTime: ExpectedSheetCell | null = null;
  for (let rowIndex = dateRowIndex - 1; rowIndex >= startIndex; rowIndex -= 1) {
    const row = matrix[rowIndex] ?? [];
    const limit = Math.min(row.length, columns.summary_start);
    for (let column = 0; column < limit; column += 1) {
      const cell = makeCell(rowIndex, column, row[column]);
      const matched = matchShiftLabel(cell.value);
      if (!matched) continue;
      if (!shiftName) shiftName = { ...cell, value: matched.name };
      if (matched.time && !shiftTime) shiftTime = { ...cell, value: matched.time };
    }
    if (shiftName) break;
  }

  const shiftNameValue = shiftName?.value ?? null;
  return {
    shift_name: shiftNameValue,
    shift_name_cell: shiftName,
    shift_time: shiftTime?.value ?? null,
    shift_time_cell: shiftTime,
    week_start_cell: sundayCell,
    week_end_cell: saturdayCell,
    week_start_date: startDate,
    week_end_date: endDate,
    daily_shifts: resolveDailyShifts(matrix, startIndex, dateRowIndex, columns, shiftNameValue),
  };
}

function findHeaderIndexes(matrix: unknown[][]): number[] {
  const indexes: number[] = [];
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    if (isHeaderRow(matrix[rowIndex] ?? [])) indexes.push(rowIndex);
  }
  return indexes;
}

function findMetaStart(matrix: unknown[][], headerIndex: number, previousEnd: number): number {
  let start = headerIndex;
  let emptyRun = 0;
  for (let rowIndex = headerIndex - 1; rowIndex > previousEnd; rowIndex -= 1) {
    const row = matrix[rowIndex] ?? [];
    if (isHeaderRow(row)) break;
    if (isEmptyRow(row)) {
      emptyRun += 1;
      if (emptyRun >= 2) break;
      continue;
    }
    emptyRun = 0;
    start = rowIndex;
  }
  return start;
}

function findBlockEnd(
  matrix: unknown[][],
  headerIndex: number,
  nextHeaderIndex: number,
  columns: ExpectedColumnMap
): number {
  let end = headerIndex;
  let emptyRun = 0;
  let seenCollector = false;
  let seenFooter = false;
  const limit = Math.min(nextHeaderIndex, matrix.length);
  for (let rowIndex = headerIndex + 1; rowIndex < limit; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    if (isHeaderRow(row)) break;
    if (isEmptyRow(row)) {
      emptyRun += 1;
      if ((seenCollector || seenFooter) && emptyRun >= 2) break;
      continue;
    }
    emptyRun = 0;
    const footer = isWeekFooterRow(row, columns);
    if (footer) {
      seenFooter = true;
      end = rowIndex;
      continue;
    }
    if (seenFooter) break;
    const collector = looksLikeCollectorRow(row, columns);
    const summary = rowHasSummaryLabel(row, columns.summary_start);
    if (collector || summary || (!seenCollector && rowHasLeftContent(row, columns))) {
      if (collector) seenCollector = true;
      end = rowIndex;
      continue;
    }
    if (seenCollector) break;
    end = rowIndex;
  }
  return end;
}

function compareWeeks(a: ExpectedWeekBlock, b: ExpectedWeekBlock): number {
  if (a.week_start_date && b.week_start_date) {
    if (a.week_start_date < b.week_start_date) return 1;
    if (a.week_start_date > b.week_start_date) return -1;
    return a.header_row - b.header_row;
  }
  if (a.week_start_date) return -1;
  if (b.week_start_date) return 1;
  return a.header_row - b.header_row;
}

export function parseExpectedWeeklyBlocks(matrix: unknown[][]): ExpectedWeekBlock[] {
  const headerIndexes = findHeaderIndexes(matrix);
  const weeks: ExpectedWeekBlock[] = [];
  let previousEnd = -1;

  for (let headerPos = 0; headerPos < headerIndexes.length; headerPos += 1) {
    const headerIndex = headerIndexes[headerPos];
    if (headerIndex === undefined) continue;
    const nextHeaderIndex = headerIndexes[headerPos + 1] ?? matrix.length;
    const yearHint = firstYearInRows(matrix, Math.max(0, headerIndex - 5), Math.min(matrix.length - 1, headerIndex + 8));
    const columns = resolveColumns(matrix[headerIndex] ?? [], yearHint);
    if (!columns) continue;

    const startIndex = findMetaStart(matrix, headerIndex, previousEnd);
    const endIndex = findBlockEnd(matrix, headerIndex, nextHeaderIndex, columns);
    const metadata = parseMetadata(matrix, startIndex, headerIndex, endIndex, columns, yearHint);
    const collectors: ExpectedCollectorRow[] = [];
    for (let rowIndex = headerIndex + 1; rowIndex <= endIndex; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      if (looksLikeCollectorRow(row, columns)) {
        collectors.push(mapCollectorRow(matrix, rowIndex, columns));
      }
    }

    previousEnd = endIndex;
    if (!metadata.week_start_date || !metadata.week_end_date || collectors.length === 0) continue;

    weeks.push({
      header_row: headerIndex + 1,
      start_row: startIndex + 1,
      end_row: endIndex + 1,
      week_start_date: metadata.week_start_date,
      week_end_date: metadata.week_end_date,
      week_start_cell: metadata.week_start_cell,
      week_end_cell: metadata.week_end_cell,
      shift_name: metadata.shift_name,
      shift_name_cell: metadata.shift_name_cell,
      shift_time: metadata.shift_time,
      shift_time_cell: metadata.shift_time_cell,
      daily_shifts: metadata.daily_shifts,
      columns,
      collectors,
      summary: parseSummary(matrix, headerIndex, endIndex, columns.summary_start),
    });
  }

  return weeks.sort(compareWeeks);
}
