import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';

import {
  AUTO_CHECK_INTERVAL_OPTIONS,
  DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
  Device,
  type DeviceComponent,
} from '../models/device.model';

export interface DeviceImportResult {
  added: number;
  updated: number;
  skipped: number;
}

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

    const normalizedDevice = {
      name: device.name.trim(),
      code: device.code.trim(),
      location: device.location.trim(),
      autoCheckIntervalSeconds: this.normalizeAutoCheckInterval(device.autoCheckIntervalSeconds),
      components: this.normalizeComponents(device.components),
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
    updates: Pick<Device, 'name' | 'location' | 'autoCheckIntervalSeconds'>,
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

    const updatedDevices = this.devicesSubject.value.map((device) =>
      device.code.trim().toLowerCase() === normalizedCode.toLowerCase()
        ? {
            ...device,
            name: normalizedName,
            location: normalizedLocation,
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
      this.devicesSubject.next([]);
      return;
    }

    try {
      const parsedDevices = JSON.parse(rawDevices) as unknown;

      if (!Array.isArray(parsedDevices)) {
        this.devicesSubject.next([]);
        return;
      }

      this.devicesSubject.next(
        parsedDevices
          .filter(this.isDevice)
          .map((device) => ({
            name: device.name.trim() || device.code.trim(),
            code: device.code.trim(),
            location: device.location.trim(),
            autoCheckIntervalSeconds: this.normalizeAutoCheckInterval(device.autoCheckIntervalSeconds),
            components: this.normalizeComponents(device.components),
          }))
          .filter((device) => device.name.length > 0 && device.code.length > 0 && device.location.length > 0),
      );
    } catch {
      this.devicesSubject.next([]);
    }
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
      (typeof candidate.autoCheckIntervalSeconds === 'number'
        || typeof candidate.autoCheckIntervalSeconds === 'undefined') &&
      (Array.isArray(candidate.components) || typeof candidate.components === 'undefined')
    );
  }

  private normalizeAutoCheckInterval(value: number | undefined): Device['autoCheckIntervalSeconds'] {
    return AUTO_CHECK_INTERVAL_OPTIONS.includes(value as Device['autoCheckIntervalSeconds'])
      ? (value as Device['autoCheckIntervalSeconds'])
      : DEFAULT_AUTO_CHECK_INTERVAL_SECONDS;
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
      autoCheckIntervalSeconds: this.normalizeAutoCheckInterval(candidate.autoCheckIntervalSeconds),
      components: this.normalizeComponents(candidate.components),
    };
  }
}
