import { NgFor, NgIf } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  chevronBackOutline,
  qrCodeOutline,
  refreshOutline,
  saveOutline,
  wifiOutline,
} from 'ionicons/icons';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonProgressBar,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import {
  DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
  DeviceType,
} from '../models/device.model';
import {
  ProvisionedDeviceInfo,
  ProvisioningWifiNetwork,
} from '../models/device-provisioning.model';
import { DeviceStoreService } from '../services/device-store.service';
import { DeviceProvisioningService } from '../services/device-provisioning.service';

type ProvisioningStep = 'scan' | 'connect' | 'wifi';

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

@Component({
  selector: 'app-device-scan',
  templateUrl: './device-scan.page.html',
  styleUrls: ['./device-scan.page.scss'],
  imports: [
    NgIf,
    NgFor,
    ReactiveFormsModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonProgressBar,
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class DeviceScanPage implements OnDestroy {
  @ViewChild('scannerVideo') scannerVideo?: ElementRef<HTMLVideoElement>;

  readonly qrForm = new FormGroup({
    qrPayload: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly wifiForm = new FormGroup({
    ssid: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    password: new FormControl('', {
      nonNullable: true,
    }),
  });

  readonly saveForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    location: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  step: ProvisioningStep = 'scan';
  scannedDeviceId = '';
  deviceInfo: ProvisionedDeviceInfo | null = null;
  wifiNetworks: ProvisioningWifiNetwork[] = [];
  connectionStatusMessage = '';
  isBusy = false;
  isScanning = false;
  scannerSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';
  private scannerStream: MediaStream | null = null;
  private scannerFrameId: number | null = null;

  constructor(
    private readonly deviceProvisioning: DeviceProvisioningService,
    private readonly deviceStore: DeviceStoreService,
    private readonly router: Router,
  ) {
    addIcons({
      'checkmark-circle-outline': checkmarkCircleOutline,
      'chevron-back-outline': chevronBackOutline,
      'qr-code-outline': qrCodeOutline,
      'refresh-outline': refreshOutline,
      'save-outline': saveOutline,
      'wifi-outline': wifiOutline,
    });
  }

  ngOnDestroy(): void {
    this.stopScanner();
  }

  async startScanner(): Promise<void> {
    if (!this.scannerSupported) {
      this.presentToast('Camera QR scanning is not available here. Enter the device ID instead.', 'danger');
      return;
    }

    await this.runBusy(async () => {
      const video = this.scannerVideo?.nativeElement;

      if (!video) {
        throw new Error('Scanner view is not ready.');
      }

      this.scannerStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
        audio: false,
      });
      video.srcObject = this.scannerStream;
      await video.play();
      this.isScanning = true;
      this.scanNextFrame();
    }, 'Unable to start the camera scanner.');
  }

  stopScanner(): void {
    if (this.scannerFrameId) {
      cancelAnimationFrame(this.scannerFrameId);
      this.scannerFrameId = null;
    }

    this.scannerStream?.getTracks().forEach((track) => track.stop());
    this.scannerStream = null;
    this.isScanning = false;
  }

  get setupEndpoint(): string {
    return this.deviceProvisioning.setupBaseUrl;
  }

  useQrPayload(): void {
    if (this.qrForm.invalid) {
      this.qrForm.markAllAsTouched();
      this.presentToast('Enter or scan a device QR code first.', 'danger');
      return;
    }

    try {
      const payload = this.deviceProvisioning.parseQrPayload(this.qrForm.controls.qrPayload.value);
      this.scannedDeviceId = payload.deviceId;
      this.stopScanner();
      this.saveForm.patchValue({
        name: payload.deviceId,
      });
      this.step = 'connect';
      this.presentToast('Device code captured. Now join the device hotspot so we can verify the ESP32.', 'success');
    } catch (error) {
      this.presentToast(this.getErrorMessage(error, 'Please scan or type the device code again.'), 'danger');
    }
  }

  async verifySetupDevice(): Promise<void> {
    if (!this.scannedDeviceId) {
      this.presentToast('Scan a device QR code first.', 'danger');
      return;
    }

    await this.runBusy(async () => {
      const info = await this.deviceProvisioning.getSetupDeviceInfo();
      this.deviceProvisioning.assertMatchingDeviceId(this.scannedDeviceId, info.deviceId);
      this.deviceInfo = info;
      this.step = 'wifi';
      await this.loadWifiNetworksAfterVerify();
    }, 'We could not reach the device info endpoint. Reconnect to the device hotspot, then try again.');
  }

  async loadWifiNetworks(): Promise<void> {
    await this.runBusy(async () => {
      this.wifiNetworks = await this.getWifiNetworks();

      if (this.wifiNetworks.length === 0) {
        this.presentToast('We could not read nearby Wi-Fi yet. You can refresh or enter the network name manually.', 'danger');
        return;
      }

      this.presentToast('Nearby Wi-Fi networks loaded. Pick the one you want the device to join.', 'success');
    }, 'The ESP32 is reachable, but Wi-Fi scanning is not ready yet. Try refresh in a moment.');
  }

  selectWifiNetwork(network: ProvisioningWifiNetwork): void {
    this.wifiForm.controls.ssid.setValue(network.ssid);
    this.wifiForm.controls.ssid.markAsDirty();
    this.connectionStatusMessage = '';
  }

  isSelectedWifiNetwork(network: ProvisioningWifiNetwork): boolean {
    return this.wifiForm.controls.ssid.value === network.ssid;
  }

  async connectAndSaveDevice(): Promise<void> {
    if (this.wifiForm.invalid || this.saveForm.invalid) {
      this.wifiForm.markAllAsTouched();
      this.saveForm.markAllAsTouched();
      this.presentToast('Select Wi-Fi and enter the device details.', 'danger');
      return;
    }

    await this.runBusy(async () => {
      this.connectionStatusMessage = 'Checking Wi-Fi credentials with the ESP32...';
      const wifiResult = await this.deviceProvisioning.sendWifiCredentials(this.wifiForm.getRawValue());

      if (!wifiResult.connected) {
        this.wifiForm.controls.password.setValue('');
        this.wifiForm.controls.password.markAsPristine();
        this.connectionStatusMessage = wifiResult.message
          || 'That Wi-Fi password did not work. The device stayed in setup mode so you can try again.';
        return;
      }

      const rawValue = this.saveForm.getRawValue();
      const hostname = this.deviceInfo?.hostname || this.hostname;

      await this.deviceStore.addDevice({
        name: rawValue.name,
        code: this.scannedDeviceId,
        location: rawValue.location,
        type: this.deviceType,
        hostname,
        model: this.deviceInfo?.model,
        firmwareVersion: this.deviceInfo?.firmwareVersion,
        autoCheckIntervalSeconds: DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
      });

      await this.router.navigate(['/devices'], {
        state: {
          message: 'Device connected and saved successfully.',
        },
      });
    }, 'We lost the device hotspot before finishing. Reconnect to the device hotspot and try again.');
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  get hotspotSsid(): string {
    return this.scannedDeviceId || 'CAM-XXXXXX';
  }

  get hostname(): string {
    return this.scannedDeviceId
      ? this.deviceProvisioning.buildMdnsHostname(this.scannedDeviceId)
      : '';
  }

  get deviceType(): DeviceType {
    return this.deviceInfo?.deviceType === DeviceType.EasyMonitoring
      ? DeviceType.EasyMonitoring
      : DeviceType.EasySwitch;
  }

  get canVerifySetupDevice(): boolean {
    return this.step === 'connect' && !!this.scannedDeviceId && !this.isBusy;
  }

  get currentStepNumber(): number {
    switch (this.step) {
      case 'connect':
        return 2;
      case 'wifi':
        return 3;
      case 'scan':
      default:
        return 1;
    }
  }

  get progressValue(): number {
    return this.currentStepNumber / 3;
  }

  get stepHeading(): string {
    switch (this.step) {
      case 'connect':
        return 'Verify the device hotspot';
      case 'wifi':
        return 'Choose Wi-Fi and save';
      case 'scan':
      default:
        return 'Add device by QR';
    }
  }

  get showQrError(): boolean {
    const control = this.qrForm.controls.qrPayload;
    return control.invalid && (control.dirty || control.touched);
  }

  get showSsidError(): boolean {
    const control = this.wifiForm.controls.ssid;
    return control.invalid && (control.dirty || control.touched);
  }

  get showNameError(): boolean {
    const control = this.saveForm.controls.name;
    return control.invalid && (control.dirty || control.touched);
  }

  get showLocationError(): boolean {
    const control = this.saveForm.controls.location;
    return control.invalid && (control.dirty || control.touched);
  }

  private async runBusy(action: () => Promise<void>, fallbackMessage: string): Promise<void> {
    if (this.isBusy) {
      return;
    }

    this.isBusy = true;

    try {
      await action();
    } catch (error) {
      this.presentToast(this.getErrorMessage(error, fallbackMessage), 'danger');
    } finally {
      this.isBusy = false;
    }
  }

  private async getWifiNetworks(): Promise<ProvisioningWifiNetwork[]> {
    return this.deviceProvisioning.scanWifiNetworks();
  }

  private async loadWifiNetworksAfterVerify(): Promise<void> {
    try {
      this.wifiNetworks = await this.getWifiNetworks();
      this.connectionStatusMessage = '';

      if (this.wifiNetworks.length === 0) {
        this.presentToast('The device is verified, but it has not returned nearby Wi-Fi yet.', 'danger');
        return;
      }

      this.presentToast('Device verified. Now choose the Wi-Fi network it should join.', 'success');
    } catch {
      this.wifiNetworks = [];
      this.presentToast('Device verified, but Wi-Fi scanning is still not ready.', 'danger');
    }
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }

  private getErrorMessage(error: unknown, fallbackMessage: string): string {
    return error instanceof Error ? error.message : fallbackMessage;
  }

  private scanNextFrame(): void {
    const video = this.scannerVideo?.nativeElement;
    const BarcodeDetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    if (!video || !BarcodeDetectorCtor || !this.isScanning) {
      return;
    }

    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });

    const scan = async () => {
      if (!this.isScanning) {
        return;
      }

      try {
        const barcodes = await detector.detect(video);
        const qrPayload = barcodes[0]?.rawValue;

        if (qrPayload) {
          this.qrForm.controls.qrPayload.setValue(qrPayload);
          this.useQrPayload();
          return;
        }
      } catch {
        this.stopScanner();
        this.presentToast('Unable to read QR frames. Enter the device ID instead.', 'danger');
        return;
      }

      this.scannerFrameId = requestAnimationFrame(scan);
    };

    this.scannerFrameId = requestAnimationFrame(scan);
  }
}
