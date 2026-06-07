export const DEFAULT_AUTO_CHECK_INTERVAL_SECONDS = 30;
export const AUTO_CHECK_INTERVAL_OPTIONS = [30, 60, 120, 240, 580] as const;
export type AutoCheckIntervalSeconds = (typeof AUTO_CHECK_INTERVAL_OPTIONS)[number];

export interface DeviceComponent {
  name: string;
  code: string;
}

export enum DeviceType {
  EasySwitch = 'EASY_SWITCH',
  EasyMonitoring = 'EASY_MONITORING',
}

export const DEFAULT_EASY_SWITCH_COMPONENTS: DeviceComponent[] = [
  {
    name: 'Equipment 1',
    code: 'equipment-1',
  },
  {
    name: 'Equipment 2',
    code: 'equipment-2',
  },
  {
    name: 'Equipment 3',
    code: 'equipment-3',
  },
  {
    name: 'Equipment 4',
    code: 'equipment-4',
  },
  {
    name: 'Equipment 5',
    code: 'equipment-5',
  },
];

export interface Device {
  name: string;
  code: string;
  location: string;
  type: DeviceType;
  hostname?: string;
  model?: string;
  firmwareVersion?: string;
  autoCheckIntervalSeconds: AutoCheckIntervalSeconds;
  components?: DeviceComponent[];
}
