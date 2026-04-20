import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { BehaviorSubject } from 'rxjs';

import {
  AUTO_CHECK_INTERVAL_OPTIONS,
  DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
  Device,
} from '../models/device.model';

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
        || typeof candidate.autoCheckIntervalSeconds === 'undefined')
    );
  }

  private normalizeAutoCheckInterval(value: number | undefined): Device['autoCheckIntervalSeconds'] {
    return AUTO_CHECK_INTERVAL_OPTIONS.includes(value as Device['autoCheckIntervalSeconds'])
      ? (value as Device['autoCheckIntervalSeconds'])
      : DEFAULT_AUTO_CHECK_INTERVAL_SECONDS;
  }
}
