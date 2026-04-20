import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  IonAlert,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToast,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import {
  AUTO_CHECK_INTERVAL_OPTIONS,
  Device,
  type AutoCheckIntervalSeconds,
} from '../models/device.model';
import { DeviceStoreService } from '../services/device-store.service';
import { DeviceHealthState, MqttConnectionState, MqttService } from '../services/mqtt.service';

@Component({
  selector: 'app-easy-remote',
  templateUrl: 'easy-remote.page.html',
  styleUrls: ['easy-remote.page.scss'],
  imports: [
    AsyncPipe,
    NgClass,
    NgFor,
    NgIf,
    IonAlert,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonToast,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
})
export class EasyRemotePage implements OnInit, OnDestroy {
  readonly autoCheckIntervalOptions = AUTO_CHECK_INTERVAL_OPTIONS;
  readonly connectionState$ = this.mqttService.state$;
  readonly deviceHealth$ = this.mqttService.deviceHealth$;
  readonly deviceCheckInProgress$ = this.mqttService.deviceCheckInProgress$;
  readonly confirmButtons = [
    {
      text: 'Cancel',
      role: 'cancel',
      handler: () => this.cancelStateChange(),
    },
    {
      text: 'Confirm',
      role: 'confirm',
      handler: () => void this.confirmStateChange(),
    },
  ];
  isSubmitting = false;
  submittingState: 'ON' | 'OFF' | null = null;
  confirmAlertOpen = false;
  pendingState: 'ON' | 'OFF' | null = null;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';
  device: Device | null = null;
  selectedAutoCheckIntervalSeconds: AutoCheckIntervalSeconds = AUTO_CHECK_INTERVAL_OPTIONS[0];
  currentDeviceHealth: DeviceHealthState = 'unknown';
  currentConnectionState: MqttConnectionState = 'disconnected';
  private readonly subscriptions = new Subscription();
  private autoRefreshIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly mqttService: MqttService,
    private readonly deviceStore: DeviceStoreService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
    });
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.subscriptions.unsubscribe();
  }

  async ngOnInit(): Promise<void> {
    this.subscriptions.add(
      this.deviceHealth$.subscribe((state) => {
        this.currentDeviceHealth = state;
      }),
    );
    this.subscriptions.add(
      this.connectionState$.subscribe((state) => {
        this.currentConnectionState = state;
      }),
    );

    await this.deviceStore.ready();

    const deviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';
    const device = this.deviceStore.findDevice(deviceCode);

    if (!device) {
      void this.router.navigate(['/devices'], {
        state: {
          message: 'Device not found. Please select a saved device.',
        },
      });
      return;
    }

    this.device = device;
    this.selectedAutoCheckIntervalSeconds = device.autoCheckIntervalSeconds;
    this.mqttService.setActiveDevice(device.code);
    await this.refreshDeviceStatus();
    this.startAutoRefresh();
  }

  requestStateChange(state: 'ON' | 'OFF'): void {
    if (this.isSubmitting || !this.canSendDeviceCommand) {
      return;
    }

    this.pendingState = state;
    this.confirmAlertOpen = true;
  }

  cancelStateChange(): void {
    this.confirmAlertOpen = false;
    this.pendingState = null;
  }

  async confirmStateChange(): Promise<void> {
    if (!this.pendingState) {
      return;
    }

    const state = this.pendingState;
    this.confirmAlertOpen = false;
    this.pendingState = null;
    await this.sendState(state);
  }

  async sendState(state: 'ON' | 'OFF'): Promise<void> {
    if (this.isSubmitting || !this.device || !this.canSendDeviceCommand) {
      return;
    }

    this.isSubmitting = true;
    this.submittingState = state;

    try {
      await this.mqttService.publishState(this.device.code, state);
      this.presentToast(`${state === 'ON' ? 'Turn on' : 'Turn off'} completed.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      this.presentToast(message, 'danger');
    } finally {
      this.isSubmitting = false;
      this.submittingState = null;
    }
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  get confirmHeader(): string {
    return this.pendingState === 'ON' ? 'Confirm Turn On' : 'Confirm Turn Off';
  }

  get confirmMessage(): string {
    return this.pendingState === 'ON'
      ? 'Are you sure you want to turn the remote on?'
      : 'Are you sure you want to turn the remote off?';
  }

  get deviceCode(): string {
    return this.device?.code ?? '';
  }

  get deviceName(): string {
    return this.device?.name ?? '';
  }

  get deviceLocation(): string {
    return this.device?.location ?? '';
  }

  get canSendDeviceCommand(): boolean {
    return this.currentDeviceHealth === 'online' && this.isServerConnected(this.currentConnectionState);
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

  async updateAutoCheckInterval(event: CustomEvent<{ value: number | string | null }>): Promise<void> {
    const nextValue = Number(event.detail.value) as AutoCheckIntervalSeconds;

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

  getServerStatusLabel(state: string | null): string {
    return this.isServerConnected(state) ? 'Connected' : 'Disconnected';
  }

  getServerStatusClass(state: string | null): string {
    return this.isServerConnected(state)
      ? 'status-connected'
      : 'status-disconnected';
  }

  getDeviceStatusLabel(state: DeviceHealthState | null): string {
    switch (state) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'checking':
        return 'Checking...';
      case 'unknown':
      default:
        return 'Unknown';
    }
  }

  getDeviceStatusClass(state: DeviceHealthState | null): string {
    switch (state) {
      case 'online':
        return 'status-connected';
      case 'checking':
      case 'unknown':
        return 'status-pending';
      case 'offline':
      default:
        return 'status-disconnected';
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
}
