import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronBackOutline,
  chevronForwardOutline,
  createOutline,
  eyeOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  IonBadge,
  IonButton,
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
    IonBadge,
    IonButton,
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
  readonly devices$ = this.deviceStore.devices$;

  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';

  constructor(
    private readonly deviceStore: DeviceStoreService,
    private readonly router: Router,
  ) {
    addIcons({
      'add-outline': addOutline,
      'chevron-back-outline': chevronBackOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'create-outline': createOutline,
      'eye-outline': eyeOutline,
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
    void this.router.navigate(['/devices/new']);
  }

  openDevice(device: Device): void {
    void this.router.navigate(['/easy-remote', device.code]);
  }

  editDevice(device: Device, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/devices', device.code, 'edit']);
  }

  async removeDevice(device: Device, event: Event): Promise<void> {
    event.stopPropagation();

    try {
      await this.deviceStore.removeDevice(device.code);
      this.presentToast('Device removed successfully.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the device.';
      this.presentToast(message, 'danger');
    }
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
