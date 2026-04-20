import { NgIf } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { addOutline, saveOutline } from 'ionicons/icons';
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
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { DeviceStoreService } from '../services/device-store.service';

@Component({
  selector: 'app-device-form',
  templateUrl: './device-form.page.html',
  styleUrls: ['./device-form.page.scss'],
  imports: [
    NgIf,
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
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class DeviceFormPage implements OnInit {
  readonly deviceForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    location: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  isEditMode = false;
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
      'save-outline': saveOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.deviceStore.ready();

    const deviceCode = this.route.snapshot.paramMap.get('deviceCode');

    if (!deviceCode) {
      return;
    }

    const device = this.deviceStore.findDevice(deviceCode);

    if (!device) {
      await this.router.navigate(['/devices'], {
        state: {
          message: 'Device not found. Please select a saved device.',
        },
      });
      return;
    }

    this.isEditMode = true;
    this.deviceForm.setValue({
      name: device.name,
      code: device.code,
      location: device.location,
    });
    this.deviceForm.controls.code.disable();
  }

  async saveDevice(): Promise<void> {
    if (this.deviceForm.invalid) {
      this.deviceForm.markAllAsTouched();
      this.presentToast('Please enter both device code and location.', 'danger');
      return;
    }

    const rawValue = this.deviceForm.getRawValue();

    try {
      if (this.isEditMode) {
        await this.deviceStore.updateDevice(rawValue.code, {
          name: rawValue.name,
          location: rawValue.location,
        });
      } else {
        await this.deviceStore.addDevice(rawValue);
      }

      await this.router.navigate(['/devices'], {
        state: {
          message: this.isEditMode ? 'Device updated successfully.' : 'Device added successfully.',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save the device.';
      this.presentToast(message, 'danger');
    }
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  get pageTitle(): string {
    return this.isEditMode ? 'EDIT DEVICE' : 'ADD DEVICE';
  }

  get pageHeading(): string {
    return this.isEditMode ? 'Update device details' : 'Register a device for Easy Remote';
  }

  get submitLabel(): string {
    return this.isEditMode ? 'SAVE CHANGES' : 'ADD DEVICE';
  }

  get hasCodeError(): boolean {
    const control = this.deviceForm.controls.code;
    return control.invalid && (control.dirty || control.touched);
  }

  get hasNameError(): boolean {
    const control = this.deviceForm.controls.name;
    return control.invalid && (control.dirty || control.touched);
  }

  get hasLocationError(): boolean {
    const control = this.deviceForm.controls.location;
    return control.invalid && (control.dirty || control.touched);
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
