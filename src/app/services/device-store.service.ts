import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';

import {
  AUTO_CHECK_INTERVAL_OPTIONS,
  DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
  DEFAULT_EASY_ALARM_COMPONENTS,
  DEFAULT_EASY_REMOTE_COMPONENTS,
  Device,
  DeviceType,
  LEGACY_EASY_SWITCH_TYPE,
  type AlarmConfiguration,
  type DeviceComponent,
} from '../models/device.model';

export interface DeviceImportResult {
  added: number;
  updated: number;
  skipped: number;
}

const DEFAULT_DEVICES: Device[] = [
  {
    name: 'SMART EASY PH DEVICE',
    code: 'smart-easy-ph-device',
    location: 'Living Room',
    type: DeviceType.EasyRemote,
    autoCheckIntervalSeconds: DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
    components: DEFAULT_EASY_REMOTE_COMPONENTS,
  },
];

@Injectable({
  providedIn: 'root',
})
export class DeviceStoreService {
  private readonly storageKey = 'easy-remote.devices';
  private readonly devicesSubject = new BehaviorSubject<Device[]>([]);
  private readonly initialized: Promise<void>;

  readonly devices$ = this.devicesSubject.asObservable();

  constructor() {
    this.initialized = this.loadDevices();
  }

  get devices(): Device[] {
    return this.devicesSubject.value;
  }

  async ready(): Promise<void> {
    await this.initialized;
  }

  async addDevice(device: Device): Promise<void> {
    await this.ready();

    const normalizedType = this.normalizeDeviceType(device.type);
    const normalizedDevice = {
      name: device.name.trim(),
      code: device.code.trim(),
      location: device.location.trim(),
      type: normalizedType,
      hostname: this.normalizeOptionalText(device.hostname),
      model: this.normalizeOptionalText(device.model),
      firmwareVersion: this.normalizeOptionalText(device.firmwareVersion),
      autoCheckIntervalSeconds: this.normalizeAutoCheckInterval(device.autoCheckIntervalSeconds),
      components: this.normalizeComponentsForType(device.type, device.components),
      alarmConfiguration: normalizedType === DeviceType.EasyAlarm
        ? this.normalizeAlarmConfiguration(device.alarmConfiguration)
        : undefined,
    };

    if (!normalizedDevice.name || !normalizedDevice.code || !normalizedDevice.location) {
      throw new Error('Device name, code, and location are required.');
    }

    if (this.findDevice(normalizedDevice.code)) {
      throw new Error('A device with this code already exists.');
    }

    const updatedDevices = [...this.devicesSubject.value, normalizedDevice];
    this.devicesSubject.next(updatedDevices);
    await this.persist(updatedDevices);
  }

  async updateDevice(
    code: string,
    updates: Pick<Device, 'name' | 'location' | 'autoCheckIntervalSeconds'> &
      Partial<Pick<Device, 'type' | 'alarmConfiguration'>>,
  ): Promise<void> {
    await this.ready();

    const normalizedCode = code.trim();
    const normalizedName = updates.name.trim();
    const normalizedLocation = updates.location.trim();
    const normalizedInterval = this.normalizeAutoCheckInterval(updates.autoCheckIntervalSeconds);

    if (!normalizedCode || !normalizedName || !normalizedLocation) {
      throw new Error('Device name, code, and location are required.');
    }

    const existingDevice = this.findDevice(normalizedCode);

    if (!existingDevice) {
      throw new Error('Device not found.');
    }

    const normalizedType = this.normalizeDeviceType(updates.type ?? existingDevice.type);

    const updatedDevices = this.devicesSubject.value.map((device) =>
      device.code.trim().toLowerCase() === normalizedCode.toLowerCase()
        ? {
            ...device,
            name: normalizedName,
            location: normalizedLocation,
            type: normalizedType,
            components: this.normalizeComponentsForType(normalizedType, device.components),
            alarmConfiguration: normalizedType === DeviceType.EasyAlarm
              ? this.normalizeAlarmConfiguration(updates.alarmConfiguration ?? device.alarmConfiguration)
              : undefined,
            autoCheckIntervalSeconds: normalizedInterval,
          }
        : device,
    );

    this.devicesSubject.next(updatedDevices);
    await this.persist(updatedDevices);
  }

  async updateDeviceComponents(code: string, components: DeviceComponent[]): Promise<void> {
    await this.ready();

    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new Error('Device code is required.');
    }

    const existingDevice = this.findDevice(normalizedCode);

    if (!existingDevice) {
      throw new Error('Device not found.');
    }

    const normalizedComponents = this.normalizeComponents(components);
    const updatedDevices = this.devicesSubject.value.map((device) =>
      device.code.trim().toLowerCase() === normalizedCode.toLowerCase()
        ? { ...device, components: normalizedComponents }
        : device,
    );

    this.devicesSubject.next(updatedDevices);
    await this.persist(updatedDevices);
  }

  async updateDeviceAutoCheckInterval(code: string, autoCheckIntervalSeconds: number): Promise<void> {
    await this.ready();

    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new Error('Device code is required.');
    }

    const existingDevice = this.findDevice(normalizedCode);

    if (!existingDevice) {
      throw new Error('Device not found.');
    }

    const normalizedInterval = this.normalizeAutoCheckInterval(autoCheckIntervalSeconds);
    const updatedDevices = this.devicesSubject.value.map((device) =>
      device.code.trim().toLowerCase() === normalizedCode.toLowerCase()
        ? { ...device, autoCheckIntervalSeconds: normalizedInterval }
        : device,
    );

    this.devicesSubject.next(updatedDevices);
    await this.persist(updatedDevices);
  }

  async importDevices(payload: unknown): Promise<DeviceImportResult> {
    await this.ready();

    const importedDevices = this.extractImportedDevices(payload);

    if (importedDevices.length === 0) {
      throw new Error('The imported file does not contain any devices.');
    }

    const normalizedImports = new Map<string, Device>();
    let skipped = 0;

    for (const candidate of importedDevices) {
      const normalizedDevice = this.normalizeImportedDevice(candidate);

      if (!normalizedDevice) {
        skipped += 1;
        continue;
      }

      normalizedImports.set(normalizedDevice.code.trim().toLowerCase(), normalizedDevice);
    }

    if (normalizedImports.size === 0) {
      throw new Error('No valid devices were found in the imported file.');
    }

    const updatedDevices = [...this.devicesSubject.value];
    let added = 0;
    let updated = 0;

    for (const [, importedDevice] of normalizedImports) {
      const normalizedCode = importedDevice.code.trim().toLowerCase();
      const existingIndex = updatedDevices.findIndex(
        (device) => device.code.trim().toLowerCase() === normalizedCode,
      );

      if (existingIndex >= 0) {
        updatedDevices[existingIndex] = {
          ...updatedDevices[existingIndex],
          ...importedDevice,
        };
        updated += 1;
      } else {
        updatedDevices.push(importedDevice);
        added += 1;
      }
    }

    this.devicesSubject.next(updatedDevices);
    await this.persist(updatedDevices);

    return {
      added,
      updated,
      skipped,
    };
  }

  async removeDevice(code: string): Promise<void> {
    await this.ready();

    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new Error('Device code is required.');
    }

    const existingDevice = this.findDevice(normalizedCode);

    if (!existingDevice) {
      throw new Error('Device not found.');
    }

    const updatedDevices = this.devicesSubject.value.filter(
      (device) => device.code.trim().toLowerCase() !== normalizedCode.toLowerCase(),
    );

    this.devicesSubject.next(updatedDevices);
    await this.persist(updatedDevices);
  }

  findDevice(code: string): Device | undefined {
    const normalizedCode = code.trim().toLowerCase();

    return this.devicesSubject.value.find(
      (device) => device.code.trim().toLowerCase() === normalizedCode,
    );
  }

  private async loadDevices(): Promise<void> {
    const { value: rawDevices } = await Preferences.get({
      key: this.storageKey,
    });

    if (!rawDevices) {
      await this.seedDefaultDevices();
      return;
    }

    try {
      const parsedDevices = JSON.parse(rawDevices) as unknown;

      if (!Array.isArray(parsedDevices)) {
        await this.seedDefaultDevices();
        return;
      }

      this.devicesSubject.next(
        parsedDevices
          .filter(this.isDevice)
          .map((device) => ({
            name: device.name.trim() || device.code.trim(),
            code: device.code.trim(),
            location: device.location.trim(),
            type: this.normalizeDeviceType(device.type),
            hostname: this.normalizeOptionalText(device.hostname),
            model: this.normalizeOptionalText(device.model),
            firmwareVersion: this.normalizeOptionalText(device.firmwareVersion),
            autoCheckIntervalSeconds: this.normalizeAutoCheckInterval(device.autoCheckIntervalSeconds),
            components: this.normalizeComponentsForType(device.type, device.components),
            alarmConfiguration: this.normalizeAlarmConfiguration(device.alarmConfiguration),
          }))
          .filter((device) => device.name.length > 0 && device.code.length > 0 && device.location.length > 0),
      );
    } catch {
      await this.seedDefaultDevices();
    }
  }

  private async seedDefaultDevices(): Promise<void> {
    const defaultDevices = this.getDefaultDevices();

    this.devicesSubject.next(defaultDevices);
    await this.persist(defaultDevices);
  }

  private getDefaultDevices(): Device[] {
    return DEFAULT_DEVICES.map((device) => ({
      ...device,
      components: this.normalizeComponents(device.components),
    }));
  }

  private async persist(devices: Device[]): Promise<void> {
    await Preferences.set({
      key: this.storageKey,
      value: JSON.stringify(devices),
    });
  }

  private isDevice(value: unknown): value is Device {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<Device>;
    return (
      typeof candidate.code === 'string' &&
      typeof candidate.location === 'string' &&
      (typeof candidate.name === 'string' || typeof candidate.name === 'undefined') &&
      (typeof candidate.hostname === 'string' || typeof candidate.hostname === 'undefined') &&
      (Object.values(DeviceType).includes(candidate.type as DeviceType)
        || typeof candidate.type === 'undefined') &&
      (typeof candidate.model === 'string' || typeof candidate.model === 'undefined') &&
      (typeof candidate.firmwareVersion === 'string' || typeof candidate.firmwareVersion === 'undefined') &&
      (typeof candidate.autoCheckIntervalSeconds === 'number'
        || typeof candidate.autoCheckIntervalSeconds === 'undefined') &&
      (Array.isArray(candidate.components) || typeof candidate.components === 'undefined') &&
      (typeof candidate.alarmConfiguration === 'object'
        || typeof candidate.alarmConfiguration === 'undefined')
    );
  }

  private normalizeAutoCheckInterval(value: number | undefined): Device['autoCheckIntervalSeconds'] {
    return AUTO_CHECK_INTERVAL_OPTIONS.includes(value as Device['autoCheckIntervalSeconds'])
      ? (value as Device['autoCheckIntervalSeconds'])
      : DEFAULT_AUTO_CHECK_INTERVAL_SECONDS;
  }

  private normalizeDeviceType(value: DeviceType | string | undefined): DeviceType {
    if (value === LEGACY_EASY_SWITCH_TYPE) {
      return DeviceType.EasyRemote;
    }

    return Object.values(DeviceType).includes(value as DeviceType)
      ? (value as DeviceType)
      : DeviceType.EasyRemote;
  }

  private normalizeComponentsForType(
    type: DeviceType | undefined,
    components: DeviceComponent[] | undefined,
  ): DeviceComponent[] {
    const normalizedType = this.normalizeDeviceType(type);
    const normalizedComponents = this.normalizeComponents(components);

    if (normalizedComponents.length > 0) {
      return normalizedComponents;
    }

    if (normalizedType === DeviceType.EasyRemote) {
      return this.normalizeComponents(DEFAULT_EASY_REMOTE_COMPONENTS);
    }

    if (normalizedType === DeviceType.EasyAlarm) {
      return this.normalizeComponents(DEFAULT_EASY_ALARM_COMPONENTS);
    }

    return [];
  }

  private normalizeAlarmConfiguration(value: AlarmConfiguration | undefined): AlarmConfiguration | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const emailAddress = this.normalizeOptionalText(value.emailAddress);
    const contactNumber = this.normalizeOptionalText(value.contactNumber);

    return emailAddress || contactNumber
      ? {
          emailAddress,
          contactNumber,
        }
      : undefined;
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
  }

  private normalizeComponents(components: DeviceComponent[] | undefined): DeviceComponent[] {
    if (!Array.isArray(components)) {
      return [];
    }

    const seenCodes = new Set<string>();

    return components
      .filter((component): component is DeviceComponent => {
        return (
          !!component &&
          typeof component.name === 'string' &&
          typeof component.code === 'string'
        );
      })
      .map((component) => ({
        name: component.name.trim(),
        code: component.code.trim(),
      }))
      .filter((component) => component.name.length > 0 && component.code.length > 0)
      .filter((component) => {
        const key = component.code.toLowerCase();

        if (seenCodes.has(key)) {
          return false;
        }

        seenCodes.add(key);
        return true;
      });
  }

  private extractImportedDevices(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const candidate = payload as { devices?: unknown };

      if (Array.isArray(candidate.devices)) {
        return candidate.devices;
      }
    }

    return [];
  }

  private normalizeImportedDevice(candidate: unknown): Device | null {
    if (!this.isDevice(candidate)) {
      return null;
    }

    const name = candidate.name?.trim() || candidate.code.trim();
    const code = candidate.code.trim();
    const location = candidate.location.trim();

    if (!name || !code || !location) {
      return null;
    }

    return {
      name,
      code,
      location,
      type: this.normalizeDeviceType(candidate.type),
      hostname: this.normalizeOptionalText(candidate.hostname),
      model: this.normalizeOptionalText(candidate.model),
      firmwareVersion: this.normalizeOptionalText(candidate.firmwareVersion),
      autoCheckIntervalSeconds: this.normalizeAutoCheckInterval(candidate.autoCheckIntervalSeconds),
      components: this.normalizeComponentsForType(candidate.type, candidate.components),
      alarmConfiguration: this.normalizeAlarmConfiguration(candidate.alarmConfiguration),
    };
  }
}
