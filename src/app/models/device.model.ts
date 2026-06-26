export const DEFAULT_AUTO_CHECK_INTERVAL_SECONDS = 30;
export const AUTO_CHECK_INTERVAL_OPTIONS = [30, 60, 120, 240, 580] as const;
export type AutoCheckIntervalSeconds = (typeof AUTO_CHECK_INTERVAL_OPTIONS)[number];

export interface DeviceComponent {
  name: string;
  code: string;
}

export enum DeviceType {
  EasyRemote = 'EASY_REMOTE',
  EasyAlarm = 'EASY_ALARM',
  EasyMonitoring = 'EASY_MONITORING',
}

export const LEGACY_EASY_SWITCH_TYPE = 'EASY_SWITCH';

export const DEFAULT_EASY_REMOTE_COMPONENTS: DeviceComponent[] = [
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

export const DEFAULT_EASY_ALARM_COMPONENTS: DeviceComponent[] = [
  {
    name: 'Email Address',
    code: 'email',
  },
  {
    name: 'Contact Number',
    code: 'contact',
  },
];

export interface AlarmConfiguration {
  emailAddress?: string;
  contactNumber?: string;
}

export interface Device {
  name: string;
  code: string;
  location: string;
  type?: DeviceType;
  hostname?: string;
  model?: string;
  firmwareVersion?: string;
  autoCheckIntervalSeconds: AutoCheckIntervalSeconds;
  components?: DeviceComponent[];
  alarmConfiguration?: AlarmConfiguration;
}
