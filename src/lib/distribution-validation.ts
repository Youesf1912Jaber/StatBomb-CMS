import { DISTRIBUTION_TASK_OPTIONS } from "@/lib/distribution-options";
import { canonicalizeDistributionTask, normalizeDistributionTask } from "@/lib/sync/distribution-identity";

export function isValidDistributionTask(value: unknown): boolean {
  const task = normalizeDistributionTask(value);
  return task.length > 0;
}

export function isPredefinedDistributionTask(value: unknown): boolean {
  const task = normalizeDistributionTask(value);
  return DISTRIBUTION_TASK_OPTIONS.some((option) => option === task);
}

export function areTasksDuplicate(task1: unknown, task2: unknown): boolean {
  const canonical1 = canonicalizeDistributionTask(task1);
  const canonical2 = canonicalizeDistributionTask(task2);
  return canonical1.length > 0 && canonical1 === canonical2;
}
