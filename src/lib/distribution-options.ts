export const DISTRIBUTION_TASK_OPTIONS = [
  "All tasks",
  "Base all / Extras",
  "Location all / Players all / FF impact goal location",
] as const;

export type DistributionTask = typeof DISTRIBUTION_TASK_OPTIONS[number];
