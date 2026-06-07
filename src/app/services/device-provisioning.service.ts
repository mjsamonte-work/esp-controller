import { Injectable } from '@angular/core';

import {
  DeviceQrPayload,
  Esp32WifiScanResponse,
  ProvisionedDeviceDraft,
  ProvisionedDeviceInfo,
  ProvisioningWifiNetwork,
  WifiCredentials,
  WifiSaveResponse,
} from '../models/device-provisioning.model';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class DeviceProvisioningService {
  parseQrPayload(rawPayload: string): DeviceQrPayload {
    const trimmedPayload = rawPayload.trim();

    if (!trimmedPayload) {
      throw new Error('QR code is empty.');
    }

    try {
      const parsedPayload = JSON.parse(trimmedPayload) as Partial<DeviceQrPayload>;
      const deviceId = parsedPayload.deviceId?.trim();

      if (deviceId) {
        return { deviceId };
      }
    } catch {
      // Plain device IDs are accepted so printed QR labels can stay simple.
    }

    return {
      deviceId: trimmedPayload,
    };
  }

  async getSetupDeviceInfo(): Promise<ProvisionedDeviceInfo> {
    return this.getJson<ProvisionedDeviceInfo>(`${this.setupBaseUrl}/device-info`);
  }

  async scanWifiNetworks(): Promise<ProvisioningWifiNetwork[]> {
    const response = await this.getJson<Esp32WifiScanResponse>(`${this.setupBaseUrl}/scan`);
    const networks = Array.isArray(response) ? response : response.networks;

    if (!Array.isArray(networks)) {
      throw new Error('The device returned an invalid Wi-Fi scan response.');
    }

    return networks
      .filter((network) => typeof network.ssid === 'string' && network.ssid.trim().length > 0)
      .map((network) => ({
        ssid: network.ssid.trim(),
        rssi: typeof network.rssi === 'number' ? network.rssi : undefined,
        secure: typeof network.secure === 'boolean' ? network.secure : undefined,
      }));
  }

  async sendWifiCredentials(credentials: WifiCredentials): Promise<WifiSaveResponse> {
    const ssid = credentials.ssid.trim();

    if (!ssid) {
      throw new Error('Please select a Wi-Fi network.');
    }

    const response = await this.postJson<WifiSaveResponse>(`${this.setupBaseUrl}/save`, {
      ssid,
      password: credentials.password,
    });

    if (typeof response.connected !== 'boolean') {
      throw new Error('The device returned an invalid Wi-Fi connection response.');
    }

    return response;
  }

  async verifyProvisionedDevice(deviceId: string): Promise<ProvisionedDeviceDraft> {
    const normalizedDeviceId = deviceId.trim();
    const hostname = `${normalizedDeviceId.toLowerCase()}.local`;
    const info = await this.getJson<ProvisionedDeviceInfo>(this.buildHomeDeviceInfoUrl(hostname));

    this.assertMatchingDeviceId(normalizedDeviceId, info.deviceId);

    return {
      code: normalizedDeviceId,
      hostname,
      model: this.normalizeOptionalText(info.model),
      firmwareVersion: this.normalizeOptionalText(info.firmwareVersion),
    };
  }

  assertMatchingDeviceId(expectedDeviceId: string, actualDeviceId: string | undefined): void {
    const expected = expectedDeviceId.trim().toLowerCase();
    const actual = actualDeviceId?.trim().toLowerCase();

    if (!expected || !actual || expected !== actual) {
      throw new Error('The connected ESP32 does not match the scanned QR code.');
    }
  }

  buildMdnsHostname(deviceId: string): string {
    return `${deviceId.trim().toLowerCase()}.local`;
  }

  get setupBaseUrl(): string {
    return environment.provisioning.setupBaseUrl;
  }

  buildHomeDeviceInfoUrl(hostname: string): string {
    const template = environment.provisioning.homeDeviceInfoUrlTemplate;

    return template.replace('{hostname}', hostname);
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    return this.readJsonResponse<T>(response);
  }

  private async postJson<T>(url: string, payload: unknown): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`ESP32 request failed with status ${response.status}.`);
    }

    return response.json() as Promise<T>;
  }

  private async readJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`ESP32 request failed with status ${response.status}.`);
    }

    return response.json() as Promise<T>;
  }

  private normalizeOptionalText(value: string | undefined): string | undefined {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue : undefined;
  }
}
