export const DEFAULT_AUTO_CHECK_INTERVAL_SECONDS = 30;
export const AUTO_CHECK_INTERVAL_OPTIONS = [30, 60, 120, 240, 580] as const;
export type AutoCheckIntervalSeconds = (typeof AUTO_CHECK_INTERVAL_OPTIONS)[number];

export interface Device {
  name: string;
  code: string;
  location: string;
  autoCheckIntervalSeconds: AutoCheckIntervalSeconds;
}
