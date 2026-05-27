import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline } from 'ionicons/icons';
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
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { type DeviceComponent } from '../models/device.model';
import { DeviceStoreService } from '../services/device-store.service';

@Component({
  selector: 'app-device-component-form',
  templateUrl: './device-component-form.page.html',
  styleUrls: ['./device-component-form.page.scss'],
  imports: [
    FormsModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class DeviceComponentFormPage implements OnInit {
  deviceCode = '';
  deviceName = '';
  componentName = '';
  componentCode = '';
  existingComponents: DeviceComponent[] = [];
  originalComponentCode: string | null = null;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';

  constructor(
    private readonly deviceStore: DeviceStoreService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    addIcons({
      'add-outline': addOutline,
      'chevron-back-outline': chevronBackOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.deviceStore.ready();

    const deviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';
    const componentCode = this.route.snapshot.paramMap.get('componentCode') ?? '';
    const device = this.deviceStore.findDevice(deviceCode);

    if (!device) {
      void this.router.navigate(['/devices'], {
        state: {
          message: 'Device not found. Please select a saved device.',
        },
      });
      return;
    }

    this.deviceCode = device.code;
    this.deviceName = device.name;
    this.existingComponents = [...(device.components ?? [])];

    if (componentCode) {
      const component = this.existingComponents.find(
        (item) => item.code.trim().toLowerCase() === componentCode.trim().toLowerCase(),
      );

      if (!component) {
        void this.router.navigate(['/devices', this.deviceCode, 'components'], {
          state: {
            message: 'Component not found. Please select a saved component.',
          },
        });
        return;
      }

      this.originalComponentCode = component.code;
      this.componentName = component.name;
      this.componentCode = component.code;
    }
  }

  async saveComponent(): Promise<void> {
    const name = this.componentName.trim();
    const code = this.componentCode.trim();

    if (!this.deviceCode) {
      return;
    }

    if (!name || !code) {
      this.presentToast('Component name and code are required.', 'danger');
      return;
    }

    const duplicate = this.existingComponents.some((component) => {
      const normalizedCode = component.code.trim().toLowerCase();

      if (this.originalComponentCode && normalizedCode === this.originalComponentCode.trim().toLowerCase()) {
        return false;
      }

      return normalizedCode === code.toLowerCase();
    });

    if (duplicate) {
      this.presentToast('A component with this code already exists.', 'danger');
      return;
    }

    const nextComponents = this.originalComponentCode
      ? this.existingComponents.map((component) =>
          component.code.trim().toLowerCase() === this.originalComponentCode?.trim().toLowerCase()
            ? {
                name,
                code,
              }
            : component,
        )
      : [
          ...this.existingComponents,
          {
            name,
            code,
          },
        ];

    try {
      await this.deviceStore.updateDeviceComponents(this.deviceCode, nextComponents);

      await this.router.navigate(['/easy-remote', this.deviceCode]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the component.';
      this.presentToast(message, 'danger');
    }
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  get componentCount(): number {
    return this.existingComponents.length;
  }

  get pageTitle(): string {
    return this.isEditing ? 'EDIT COMPONENT' : 'ADD COMPONENT';
  }

  get buttonLabel(): string {
    return this.isEditing ? 'SAVE CHANGES' : 'SAVE COMPONENT';
  }

  get isEditing(): boolean {
    return this.originalComponentCode !== null;
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
