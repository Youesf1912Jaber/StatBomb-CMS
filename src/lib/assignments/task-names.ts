export const ASSIGNMENT_TASK_NAMES = [
  "Base + Extras",
  "pressure",
  "Location all",
  "Players all",
  "FF impact goal location",
  "Players +Location  Home",
  "Players +Location  Away",
] as const;

export type AssignmentTaskName = (typeof ASSIGNMENT_TASK_NAMES)[number];

export function isAssignmentTaskName(value: string): value is AssignmentTaskName {
  return (ASSIGNMENT_TASK_NAMES as readonly string[]).includes(value);
}

export function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
