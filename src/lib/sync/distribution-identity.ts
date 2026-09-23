export const VALID_ASSIGNMENT_HALVES = new Set(["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"]);

export function normalizeMatchId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? String(value) : null;
  }
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

export function normalizeDistributionTask(value: unknown): string {
  const text = String(value ?? "").trim();
  return text
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDistributionHalf(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Full Match";
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "1": "Half 1",
    "half 1": "Half 1",
    "h1": "Half 1",
    "2": "Half 2",
    "half 2": "Half 2",
    "h2": "Half 2",
    "3": "Half 3",
    "half 3": "Half 3",
    "h3": "Half 3",
    "4": "Half 4",
    "half 4": "Half 4",
    "h4": "Half 4",
    full: "Full Match",
    "full match": "Full Match",
    "full game": "Full Match",
  };
  return map[key] ?? raw;
}

export function logicalAssignmentKey(matchExternalId: string, task: string, half: string): string {
  return `${matchExternalId}|${normalizeDistributionTask(task).toLowerCase()}|${normalizeDistributionHalf(half).toLowerCase()}`;
}
