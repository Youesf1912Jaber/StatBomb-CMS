export const BONUS_REASONS = ["Academy", "Bad Match", "Hypercare", "Extra Time"] as const;
export type BonusReason = (typeof BONUS_REASONS)[number];

export const BONUS_TASKS = ["1", "2", "3", "4"] as const;
export type BonusTask = (typeof BONUS_TASKS)[number];

export const BONUS_RESOLUTIONS = ["Valid", "Invalid"] as const;
export type BonusResolution = (typeof BONUS_RESOLUTIONS)[number];

export function isBonusReason(value: unknown): value is BonusReason {
  return typeof value === "string" && (BONUS_REASONS as readonly string[]).includes(value);
}

export function isBonusTask(value: unknown): value is BonusTask {
  return typeof value === "string" && (BONUS_TASKS as readonly string[]).includes(value);
}

export function isBonusResolution(value: unknown): value is BonusResolution {
  return typeof value === "string" && (BONUS_RESOLUTIONS as readonly string[]).includes(value);
}
