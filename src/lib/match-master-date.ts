function validDate(year: number, month: number, day: number): string | null {
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

export function normalizeEtaDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\D|$)/);
  if (match) {
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (match) {
    return validDate(Number(match[3]), Number(match[1]), Number(match[2]));
  }

  match = text.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})(?:\D|$)/);
  if (match) {
    return validDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  return null;
}
