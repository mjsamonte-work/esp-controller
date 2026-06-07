export interface DeviceQrPayload {
  deviceId: string;
}

export interface ProvisionedDeviceInfo {
  deviceId: string;
  deviceType?: string;
  ssid?: string;
  model?: string;
  firmwareVersion?: string;
  setupMode?: boolean;
  hostname?: string;
  ipAddress?: string;
  macAddress?: string;
}

export interface ProvisioningWifiNetwork {
  ssid: string;
  rssi?: number;
  secure?: boolean;
}

export interface WifiScanResponse {
  networks: ProvisioningWifiNetwork[];
}

export type Esp32WifiScanResponse = ProvisioningWifiNetwork[] | WifiScanResponse;

export interface WifiCredentials {
  ssid: string;
  password: string;
}

export interface WifiSaveResponse {
  success?: boolean;
  connected?: boolean;
  rebooting?: boolean;
  ssid?: string;
  ipAddress?: string;
  message?: string;
}

export interface ProvisionedDeviceDraft {
  code: string;
  hostname: string;
  model?: string;
  firmwareVersion?: string;
}
