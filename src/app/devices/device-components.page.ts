import { NgFor, NgIf } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, chevronForwardOutline, createOutline, eyeOutline, trashOutline } from 'ionicons/icons';
import {
  IonBadge,
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

import { type DeviceComponent } from '../models/device.model';
import { DeviceStoreService } from '../services/device-store.service';

@Component({
  selector: 'app-device-components',
  templateUrl: './device-components.page.html',
  styleUrls: ['./device-components.page.scss'],
  imports: [
    NgFor,
    NgIf,
    IonBadge,
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
export class DeviceComponentsPage implements OnInit {
  showAddComponentAction = false;
  showEditComponentAction = true;
  showDeleteComponentAction = false;
  deviceCode = '';
  deviceName = '';
  components: DeviceComponent[] = [];
  private routeDeviceCode = '';
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';
  removeConfirmOpen = false;
  pendingRemoveComponentCode = '';
  pendingRemoveComponentName = '';
  readonly removeConfirmButtons = [
    {
      text: 'Cancel',
      role: 'cancel',
      handler: () => this.cancelRemoveComponent(),
    },
    {
      text: 'Remove',
      role: 'destructive',
      handler: () => void this.confirmRemoveComponent(),
    },
  ];

  constructor(
    private readonly deviceStore: DeviceStoreService,
    private readonly route: ActivatedRoute,
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

    this.routeDeviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';

    if (!(await this.loadDevice(true))) {
      return;
    }
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.routeDeviceCode) {
      return;
    }

    await this.loadDevice(false);
  }

  addComponent(): void {
    if (!this.showAddComponentAction || !this.deviceCode) {
      return;
    }

    void this.router.navigate(['/devices', this.deviceCode, 'components', 'new']);
  }

  openComponent(component: DeviceComponent): void {
    if (!this.deviceCode) {
      return;
    }

    void this.router.navigate(['/easy-remote', this.deviceCode, 'components', component.code]);
  }

  editComponent(componentCode: string): void {
    if (!this.showEditComponentAction || !this.deviceCode) {
      return;
    }

    const normalizedCode = componentCode.trim();

    if (!normalizedCode) {
      return;
    }

    void this.router.navigate(['/devices', this.deviceCode, 'components', normalizedCode, 'edit']);
  }

  removeComponent(componentCode: string, componentName = ''): void {
    if (!this.showDeleteComponentAction || !this.deviceCode) {
      return;
    }

    const normalizedCode = componentCode.trim();

    if (!normalizedCode) {
      return;
    }

    this.pendingRemoveComponentCode = normalizedCode;
    this.pendingRemoveComponentName = componentName.trim();
    this.removeConfirmOpen = true;
  }

  cancelRemoveComponent(): void {
    this.removeConfirmOpen = false;
    this.pendingRemoveComponentCode = '';
    this.pendingRemoveComponentName = '';
  }

  async confirmRemoveComponent(): Promise<void> {
    if (!this.deviceCode || !this.pendingRemoveComponentCode) {
      return;
    }

    const normalizedCode = this.pendingRemoveComponentCode.trim().toLowerCase();
    const nextComponents = this.components.filter(
      (component) => component.code.trim().toLowerCase() !== normalizedCode,
    );

    try {
      await this.deviceStore.updateDeviceComponents(this.deviceCode, nextComponents);
      this.components = nextComponents;
      this.presentToast('Component removed successfully.', 'success');
      this.cancelRemoveComponent();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the component.';
      this.presentToast(message, 'danger');
    }
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  get hasComponents(): boolean {
    return this.components.length > 0;
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }

  get removeConfirmMessage(): string {
    return this.pendingRemoveComponentName
      ? `Are you sure you want to remove ${this.pendingRemoveComponentName}?`
      : 'Are you sure you want to remove this component?';
  }

  private async loadDevice(redirectOnMissing: boolean): Promise<boolean> {
    const device = this.deviceStore.findDevice(this.routeDeviceCode);

    if (!device) {
      if (redirectOnMissing) {
        void this.router.navigate(['/devices'], {
          state: {
            message: 'Device not found. Please select a saved device.',
          },
        });
      }

      return false;
    }

    this.deviceCode = device.code;
    this.deviceName = device.name;
    this.components = [...(device.components ?? [])];
    return true;
  }
}
