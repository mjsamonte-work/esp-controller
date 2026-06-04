import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import {
  IonAlert,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonToast,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Device, type DeviceComponent } from '../models/device.model';
import { DeviceStoreService } from '../services/device-store.service';
import {
  DeviceHealthState,
  EquipmentState,
  MqttConnectionState,
  MqttService,
} from '../services/mqtt.service';

@Component({
  selector: 'app-component-control',
  templateUrl: 'component-control.page.html',
  styleUrls: ['component-control.page.scss'],
  imports: [
    AsyncPipe,
    NgClass,
    NgIf,
    IonAlert,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonToast,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
})
export class ComponentControlPage implements OnInit, OnDestroy {
  readonly connectionState$ = this.mqttService.state$;
  readonly deviceHealth$ = this.mqttService.deviceHealth$;
  readonly componentHealth$ = this.mqttService.componentHealth$;
  readonly equipmentState$ = this.mqttService.equipmentState$;
  readonly toastButtons = [
    {
      text: 'Close',
      role: 'cancel',
    },
  ];
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
  component: DeviceComponent | null = null;
  private routeDeviceCode = '';
  private routeComponentCode = '';
  currentDeviceHealth: DeviceHealthState = 'unknown';
  currentComponentHealth: DeviceHealthState = 'unknown';
  currentEquipmentState: EquipmentState = 'unknown';
  currentConnectionState: MqttConnectionState = 'disconnected';
  private commandHealthTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly subscriptions = new Subscription();

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
    this.clearCommandHealthTimeout();
    this.subscriptions.unsubscribe();
  }

  async ngOnInit(): Promise<void> {
    this.subscriptions.add(
      this.deviceHealth$.subscribe((state) => {
        this.currentDeviceHealth = state;
      }),
    );
    this.subscriptions.add(
      this.componentHealth$.subscribe((state) => {
        this.currentComponentHealth = state;
        if (state === 'online') {
          this.clearCommandHealthTimeout();
        }
      }),
    );
    this.subscriptions.add(
      this.equipmentState$.subscribe((state) => {
        this.currentEquipmentState = state;
        if (state === 'ON' || state === 'OFF') {
          this.clearCommandHealthTimeout();
        }
      }),
    );
    this.subscriptions.add(
      this.connectionState$.subscribe((state) => {
        this.currentConnectionState = state;
      }),
    );

    await this.deviceStore.ready();

    this.routeDeviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';
    this.routeComponentCode = this.route.snapshot.paramMap.get('componentCode') ?? '';

    if (!(await this.loadComponent(true))) {
      return;
    }

    await this.refreshDeviceStatus();
    await this.refreshComponentStatus();
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.routeDeviceCode || !this.routeComponentCode) {
      return;
    }

    if (!(await this.loadComponent(false))) {
      return;
    }

    await this.refreshDeviceStatus();
    await this.refreshComponentStatus();
  }

  requestStateChange(state: 'ON' | 'OFF'): void {
    if (!this.device || !this.component || !this.canSendDeviceCommand || this.isSubmitting) {
      return;
    }

    this.mqttService.setActiveComponent(this.device.code, this.component.code);
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
    this.cancelStateChange();
    await this.sendState(state);
  }

  async sendState(state: 'ON' | 'OFF'): Promise<void> {
    if (this.isSubmitting || !this.device || !this.component || !this.canSendDeviceCommand) {
      return;
    }

    this.isSubmitting = true;
    this.submittingState = state;

    try {
      await this.mqttService.publishComponentState(this.device.code, this.component.code, state);
      this.presentToast(
        `TURN ${state} command sent for ${this.component.name}.`,
        'success',
      );
      this.startCommandHealthFallback();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      this.presentToast(message, 'danger');
    } finally {
      this.isSubmitting = false;
      this.submittingState = null;
    }
  }

  closeToast(): void {
    this.clearToastTimeout();
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

  get componentName(): string {
    return this.component?.name ?? '';
  }

  get componentCode(): string {
    return this.component?.code ?? '';
  }

  get canSendDeviceCommand(): boolean {
    return this.isServerConnected(this.currentConnectionState) && this.currentDeviceHealth === 'online';
  }

  get confirmHeader(): string {
    return this.pendingState === 'ON'
      ? 'Confirm Turn On'
      : 'Confirm Turn Off';
  }

  get confirmMessage(): string {
    const action = this.pendingState === 'ON' ? 'turn on' : 'turn off';
    return `Are you sure you want to ${action} ${this.componentName || this.componentCode}?`;
  }

  async refreshDeviceStatus(): Promise<void> {
    if (!this.device) {
      return;
    }

    try {
      await this.mqttService.checkDeviceStatus(this.device.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to check device status.';
      this.presentToast(message, 'danger');
    }
  }

  async refreshComponentStatus(): Promise<void> {
    if (!this.device || !this.component) {
      return;
    }

    try {
      await this.mqttService.checkComponentStatus(this.device.code, this.component.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to check component status.';
      this.presentToast(message, 'danger');
    }
  }

  getServerStatusLabel(state: string | null): string {
    return this.isServerConnected(state) ? 'Connected' : 'Disconnected';
  }

  getServerStatusClass(state: string | null): string {
    return this.isServerConnected(state) ? 'status-connected' : 'status-disconnected';
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

  getLastEquipmentStateLabel(
    healthState: DeviceHealthState | null,
    equipmentState: EquipmentState | null,
  ): string {
    if (healthState === 'checking') {
      return 'Checking...';
    }

    if (healthState === 'offline') {
      return 'Offline';
    }

    switch (equipmentState) {
      case 'ON':
        return 'ON';
      case 'OFF':
        return 'OFF';
      case 'unknown':
      default:
        return healthState === 'unknown' ? 'Unknown' : 'Checking...';
    }
  }

  getLastEquipmentStateClass(
    healthState: DeviceHealthState | null,
    equipmentState: EquipmentState | null,
  ): string {
    if (healthState === 'checking' || healthState === 'unknown') {
      return 'status-pending';
    }

    if (healthState === 'offline') {
      return 'status-disconnected';
    }

    switch (equipmentState) {
      case 'ON':
        return 'status-connected';
      case 'OFF':
        return 'status-disconnected';
      case 'unknown':
      default:
        return 'status-pending';
    }
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.clearToastTimeout();
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
    this.toastTimeoutId = setTimeout(() => {
      this.toastOpen = false;
      this.toastTimeoutId = null;
    }, 3000);
  }

  private clearToastTimeout(): void {
    if (this.toastTimeoutId) {
      clearTimeout(this.toastTimeoutId);
      this.toastTimeoutId = null;
    }
  }

  private isServerConnected(state: string | null): boolean {
    return state === 'subscribed' || state === 'connected';
  }

  private startCommandHealthFallback(): void {
    this.clearCommandHealthTimeout();

    this.commandHealthTimeoutId = setTimeout(() => {
      this.commandHealthTimeoutId = null;
      void this.refreshDeviceStatus();
    }, 5000);
  }

  private clearCommandHealthTimeout(): void {
    if (this.commandHealthTimeoutId) {
      clearTimeout(this.commandHealthTimeoutId);
      this.commandHealthTimeoutId = null;
    }
  }

  private async loadComponent(redirectOnMissing: boolean): Promise<boolean> {
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

    const component = (device.components ?? []).find(
      (item) => item.code.trim().toLowerCase() === this.routeComponentCode.trim().toLowerCase(),
    );

    if (!component) {
      if (redirectOnMissing) {
        void this.router.navigate(['/easy-remote', device.code], {
          state: {
            message: 'Component not found. Please select a saved component.',
          },
        });
      }

      return false;
    }

    this.device = device;
    this.component = component;
    this.mqttService.setActiveComponent(device.code, component.code);
    return true;
  }
}
