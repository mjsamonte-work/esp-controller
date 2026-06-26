import { NgFor, NgIf } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, qrCodeOutline, saveOutline } from 'ionicons/icons';
import {
  AUTO_CHECK_INTERVAL_OPTIONS,
  DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
  DeviceType,
  type AutoCheckIntervalSeconds,
} from '../models/device.model';
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
  IonSelect,
  IonSelectOption,
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
    IonSelect,
    IonSelectOption,
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class DeviceFormPage implements OnInit {
  readonly autoCheckIntervalOptions = AUTO_CHECK_INTERVAL_OPTIONS;
  readonly deviceType = DeviceType;
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
    type: new FormControl<DeviceType>(DeviceType.EasyRemote, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    emailAddress: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email],
    }),
    contactNumber: new FormControl('', {
      nonNullable: true,
    }),
    autoCheckIntervalSeconds: new FormControl<AutoCheckIntervalSeconds>(
      DEFAULT_AUTO_CHECK_INTERVAL_SECONDS,
      {
        nonNullable: true,
      },
    ),
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
      'chevron-back-outline': chevronBackOutline,
      'qr-code-outline': qrCodeOutline,
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
      type: device.type ?? DeviceType.EasyRemote,
      emailAddress: device.alarmConfiguration?.emailAddress ?? '',
      contactNumber: device.alarmConfiguration?.contactNumber ?? '',
      autoCheckIntervalSeconds: device.autoCheckIntervalSeconds,
    });
    this.deviceForm.controls.code.disable();
  }

  async saveDevice(): Promise<void> {
    if (this.deviceForm.invalid) {
      this.deviceForm.markAllAsTouched();
      this.presentToast('Please complete the required device details.', 'danger');
      return;
    }

    if (this.isAlarmType && !this.hasAlarmConfiguration) {
      this.deviceForm.controls.emailAddress.markAsTouched();
      this.deviceForm.controls.contactNumber.markAsTouched();
      this.presentToast('Enter an email address or contact number for Easy Alarm.', 'danger');
      return;
    }

    const rawValue = this.deviceForm.getRawValue();
    const alarmConfiguration = rawValue.type === DeviceType.EasyAlarm
      ? {
          emailAddress: rawValue.emailAddress.trim() || undefined,
          contactNumber: rawValue.contactNumber.trim() || undefined,
        }
      : undefined;

    try {
      if (this.isEditMode) {
        await this.deviceStore.updateDevice(rawValue.code, {
          name: rawValue.name,
          location: rawValue.location,
          type: rawValue.type,
          alarmConfiguration,
          autoCheckIntervalSeconds: rawValue.autoCheckIntervalSeconds,
        });
      } else {
        await this.deviceStore.addDevice({
          name: rawValue.name,
          code: rawValue.code,
          location: rawValue.location,
          type: rawValue.type,
          alarmConfiguration,
          autoCheckIntervalSeconds: rawValue.autoCheckIntervalSeconds,
        });
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

  scanDevice(): void {
    if (this.isEditMode) {
      return;
    }

    void this.router.navigate(['/devices/scan']);
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

  get hasEmailError(): boolean {
    const control = this.deviceForm.controls.emailAddress;
    return control.invalid && (control.dirty || control.touched);
  }

  get isAlarmType(): boolean {
    return this.deviceForm.controls.type.value === DeviceType.EasyAlarm;
  }

  get hasAlarmConfiguration(): boolean {
    const rawValue = this.deviceForm.getRawValue();
    return rawValue.emailAddress.trim().length > 0 || rawValue.contactNumber.trim().length > 0;
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
