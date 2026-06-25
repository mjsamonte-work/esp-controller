import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  addOutline,
  cloudUploadOutline,
  chevronBackOutline,
  chevronForwardOutline,
  createOutline,
  cubeOutline,
  eyeOutline,
  informationCircleOutline,
  qrCodeOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  IonButton,
  IonAlert,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Device } from '../models/device.model';
import { DeviceStoreService } from '../services/device-store.service';

@Component({
  selector: 'app-devices',
  templateUrl: './devices.page.html',
  styleUrls: ['./devices.page.scss'],
  imports: [
    AsyncPipe,
    NgFor,
    NgIf,
    IonButton,
    IonAlert,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class DevicesPage implements OnInit {
  showAddDeviceAction = false;
  showScanDeviceAction = true;
  showImportDeviceAction = false;
  showEditDeviceAction = true;
  showDeleteDeviceAction = false;
  readonly devices$ = this.deviceStore.devices$;
  readonly removeConfirmButtons = [
    {
      text: 'Cancel',
      role: 'cancel',
      handler: () => this.cancelRemoveDevice(),
    },
    {
      text: 'Remove',
      role: 'destructive',
      handler: () => void this.confirmRemoveDevice(),
    },
  ];

  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';
  removeConfirmOpen = false;
  pendingRemoveDevice: Device | null = null;

  constructor(
    private readonly deviceStore: DeviceStoreService,
    private readonly router: Router,
  ) {
    addIcons({
      'add-outline': addOutline,
      'cloud-upload-outline': cloudUploadOutline,
      'chevron-back-outline': chevronBackOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'cube-outline': cubeOutline,
      'information-circle-outline': informationCircleOutline,
      'create-outline': createOutline,
      'eye-outline': eyeOutline,
      'qr-code-outline': qrCodeOutline,
      'trash-outline': trashOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.deviceStore.ready();

    const navigation = this.router.getCurrentNavigation();
    const errorMessage = navigation?.extras.state?.['message'] as string | undefined;

    if (errorMessage) {
      this.presentToast(errorMessage, 'danger');
    }
  }

  createDevice(): void {
    if (!this.showAddDeviceAction) {
      return;
    }

    void this.router.navigate(['/devices/new']);
  }

  importDevices(): void {
    if (!this.showImportDeviceAction) {
      return;
    }

    void this.router.navigate(['/devices/import']);
  }

  scanDevice(): void {
    if (!this.showScanDeviceAction) {
      return;
    }

    void this.router.navigate(['/devices/scan']);
  }

  openDevice(device: Device): void {
    void this.router.navigate(['/easy-remote', device.code]);
  }

  editDevice(device: Device, event: Event): void {
    if (!this.showEditDeviceAction) {
      return;
    }

    event.stopPropagation();
    void this.router.navigate(['/devices', device.code, 'edit']);
  }

  async removeDevice(device: Device, event: Event): Promise<void> {
    if (!this.showDeleteDeviceAction) {
      return;
    }

    event.stopPropagation();
    this.pendingRemoveDevice = device;
    this.removeConfirmOpen = true;
  }

  cancelRemoveDevice(): void {
    this.removeConfirmOpen = false;
    this.pendingRemoveDevice = null;
  }

  async confirmRemoveDevice(): Promise<void> {
    if (!this.pendingRemoveDevice) {
      return;
    }

    const device = this.pendingRemoveDevice;

    try {
      await this.deviceStore.removeDevice(device.code);
      this.presentToast('Device removed successfully.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the device.';
      this.presentToast(message, 'danger');
    } finally {
      this.cancelRemoveDevice();
    }
  }

  get removeConfirmMessage(): string {
    return this.pendingRemoveDevice
      ? `Are you sure you want to remove ${this.pendingRemoveDevice.name || this.pendingRemoveDevice.code}?`
      : 'Are you sure you want to remove this device?';
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
