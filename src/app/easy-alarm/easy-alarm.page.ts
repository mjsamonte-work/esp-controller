import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  mailOutline,
  phonePortraitOutline,
  saveOutline,
} from 'ionicons/icons';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSpinner,
  IonText,
  IonToast,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import {
  AUTO_CHECK_INTERVAL_OPTIONS,
  Device,
  DeviceType,
  type AutoCheckIntervalSeconds,
} from '../models/device.model';
import { DeviceStoreService } from '../services/device-store.service';
import {
  AlarmConfigUpdate,
  DeviceHealthState,
  MqttConnectionState,
  MqttService,
} from '../services/mqtt.service';
import { DeviceDetailsCardComponent } from '../shared/device-details-card/device-details-card.component';
import { AutoCheckIntervalComponent } from '../shared/auto-check-interval/auto-check-interval.component';
import { DeviceStatusSectionComponent } from '../shared/device-status-section/device-status-section.component';

type AlarmSaveTarget = 'email' | 'contact';

@Component({
  selector: 'app-easy-alarm',
  templateUrl: 'easy-alarm.page.html',
  styleUrls: ['easy-alarm.page.scss'],
  imports: [
    NgIf,
    ReactiveFormsModule,
    DeviceDetailsCardComponent,
    AutoCheckIntervalComponent,
    DeviceStatusSectionComponent,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonSpinner,
    IonText,
    IonToast,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
})
export class EasyAlarmPage implements OnInit, OnDestroy {
  readonly autoCheckIntervalOptions = AUTO_CHECK_INTERVAL_OPTIONS;
  readonly connectionState$ = this.mqttService.state$;
  readonly deviceHealth$ = this.mqttService.deviceHealth$;
  readonly deviceCheckInProgress$ = this.mqttService.deviceCheckInProgress$;
  readonly alarmForm = new FormGroup({
    emailAddress: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email],
    }),
    contactNumber: new FormControl('', {
      nonNullable: true,
    }),
  });

  device: Device | null = null;
  routeDeviceCode = '';
  savingTarget: AlarmSaveTarget | null = null;
  lastEmailStatus = 'Not saved yet';
  lastContactStatus = 'Not saved yet';
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';
  currentConnectionState: MqttConnectionState = 'disconnected';
  currentDeviceHealth: DeviceHealthState = 'unknown';
  selectedAutoCheckIntervalSeconds: AutoCheckIntervalSeconds = AUTO_CHECK_INTERVAL_OPTIONS[0];
  private autoRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly mqttService: MqttService,
    private readonly deviceStore: DeviceStoreService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
      'mail-outline': mailOutline,
      'phone-portrait-outline': phonePortraitOutline,
      'save-outline': saveOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.subscriptions.add(
      this.connectionState$.subscribe((state) => {
        this.currentConnectionState = state;
      }),
    );
    this.subscriptions.add(
      this.deviceHealth$.subscribe((state) => {
        this.currentDeviceHealth = state;
      }),
    );
    this.subscriptions.add(
      this.mqttService.alarmConfigUpdate$.subscribe((update) => this.handleAlarmUpdate(update)),
    );

    await this.deviceStore.ready();
    this.routeDeviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';

    if (!(await this.loadDevice())) {
      return;
    }

    await this.refreshDeviceStatus();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.subscriptions.unsubscribe();
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.routeDeviceCode) {
      return;
    }

    await this.loadDevice();
  }

  async refreshDeviceStatus(): Promise<void> {
    if (!this.device) {
      return;
    }

    this.startAutoRefresh();

    try {
      await this.mqttService.checkDeviceStatus(this.device.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to check device status.';
      this.presentToast(message, 'danger');
    }
  }

  async updateAutoCheckInterval(nextValue: AutoCheckIntervalSeconds): Promise<void> {
    if (!this.device || !AUTO_CHECK_INTERVAL_OPTIONS.includes(nextValue)) {
      return;
    }

    this.selectedAutoCheckIntervalSeconds = nextValue;
    this.device = {
      ...this.device,
      autoCheckIntervalSeconds: nextValue,
    };
    this.startAutoRefresh();

    try {
      await this.deviceStore.updateDeviceAutoCheckInterval(this.device.code, nextValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save auto-check interval.';
      this.presentToast(message, 'danger');
    }
  }

  async saveEmail(): Promise<void> {
    const control = this.alarmForm.controls.emailAddress;
    control.markAsTouched();

    if (control.invalid || !control.value.trim()) {
      this.presentToast('Enter a valid email address.', 'danger');
      return;
    }

    await this.saveAlarmValue('email', control.value);
  }

  async saveContact(): Promise<void> {
    const control = this.alarmForm.controls.contactNumber;
    control.markAsTouched();

    if (!control.value.trim()) {
      this.presentToast('Enter a contact number.', 'danger');
      return;
    }

    await this.saveAlarmValue('contact', control.value);
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  get deviceCode(): string {
    return this.device?.code ?? this.routeDeviceCode;
  }

  get deviceName(): string {
    return this.device?.name ?? '';
  }

  get deviceLocation(): string {
    return this.device?.location ?? '';
  }

  get canSendCommand(): boolean {
    return this.isServerConnected(this.currentConnectionState);
  }

  get hasEmailError(): boolean {
    const control = this.alarmForm.controls.emailAddress;
    return control.invalid && (control.dirty || control.touched);
  }

  private async saveAlarmValue(target: AlarmSaveTarget, rawValue: string): Promise<void> {
    if (!this.device || this.savingTarget) {
      return;
    }

    const value = rawValue.trim();
    this.savingTarget = target;
    this.setPendingStatus(target);

    try {
      await this.mqttService.publishComponentValue(this.device.code, target, value);
      const nextConfiguration = {
        emailAddress: target === 'email'
          ? value
          : this.alarmForm.controls.emailAddress.value.trim() || undefined,
        contactNumber: target === 'contact'
          ? value
          : this.alarmForm.controls.contactNumber.value.trim() || undefined,
      };

      await this.deviceStore.updateDevice(this.device.code, {
        name: this.device.name,
        location: this.device.location,
        type: DeviceType.EasyAlarm,
        alarmConfiguration: nextConfiguration,
        autoCheckIntervalSeconds: this.device.autoCheckIntervalSeconds,
      });

      this.device = {
        ...this.device,
        alarmConfiguration: nextConfiguration,
      };
      this.presentToast(`${target === 'email' ? 'Email' : 'Contact'} update sent.`, 'success');
    } catch (error) {
      this.setErrorStatus(target);
      const message = error instanceof Error ? error.message : 'Unable to save alarm configuration.';
      this.presentToast(message, 'danger');
    } finally {
      this.savingTarget = null;
    }
  }

  private handleAlarmUpdate(update: AlarmConfigUpdate | null): void {
    if (!update) {
      return;
    }

    const status = update.state === 'UPDATED' ? 'Saved to ESP32' : 'Device reported an error';

    if (update.component === 'email') {
      this.lastEmailStatus = status;
    }

    if (update.component === 'contact') {
      this.lastContactStatus = status;
    }
  }

  private setPendingStatus(target: AlarmSaveTarget): void {
    if (target === 'email') {
      this.lastEmailStatus = 'Sending to ESP32...';
    } else {
      this.lastContactStatus = 'Sending to ESP32...';
    }
  }

  private setErrorStatus(target: AlarmSaveTarget): void {
    if (target === 'email') {
      this.lastEmailStatus = 'Unable to send';
    } else {
      this.lastContactStatus = 'Unable to send';
    }
  }

  private async loadDevice(): Promise<boolean> {
    const device = this.deviceStore.findDevice(this.routeDeviceCode);

    if (!device) {
      void this.router.navigate(['/devices'], {
        state: {
          message: 'Device not found. Please select a saved device.',
        },
      });
      return false;
    }

    if (device.type !== DeviceType.EasyAlarm) {
      void this.router.navigate(['/easy-remote', device.code]);
      return false;
    }

    this.device = device;
    this.selectedAutoCheckIntervalSeconds = device.autoCheckIntervalSeconds;
    this.alarmForm.patchValue({
      emailAddress: device.alarmConfiguration?.emailAddress ?? '',
      contactNumber: device.alarmConfiguration?.contactNumber ?? '',
    });
    this.mqttService.setActiveDevice(device.code);
    return true;
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();

    this.autoRefreshIntervalId = setInterval(() => {
      void this.refreshDeviceStatus();
    }, this.selectedAutoCheckIntervalSeconds * 1000);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshIntervalId) {
      clearInterval(this.autoRefreshIntervalId);
      this.autoRefreshIntervalId = null;
    }
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }

  private isServerConnected(state: string | null): boolean {
    return state === 'subscribed' || state === 'connected';
  }
}
