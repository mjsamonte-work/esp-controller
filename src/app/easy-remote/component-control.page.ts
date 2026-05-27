import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import {
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
import { DeviceHealthState, MqttConnectionState, MqttService } from '../services/mqtt.service';

@Component({
  selector: 'app-component-control',
  templateUrl: 'component-control.page.html',
  styleUrls: ['component-control.page.scss'],
  imports: [
    AsyncPipe,
    NgClass,
    NgIf,
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
  readonly deviceCheckInProgress$ = this.mqttService.deviceCheckInProgress$;

  isSubmitting = false;
  submittingState: 'ON' | 'OFF' | null = null;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';
  device: Device | null = null;
  component: DeviceComponent | null = null;
  private routeDeviceCode = '';
  private routeComponentCode = '';
  currentDeviceHealth: DeviceHealthState = 'unknown';
  currentConnectionState: MqttConnectionState = 'disconnected';

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

    this.routeDeviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';
    this.routeComponentCode = this.route.snapshot.paramMap.get('componentCode') ?? '';

    if (!(await this.loadComponent(true))) {
      return;
    }

    await this.refreshDeviceStatus();
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.routeDeviceCode || !this.routeComponentCode) {
      return;
    }

    await this.loadComponent(false);
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
        `${state === 'ON' ? 'Turn on' : 'Turn off'} completed for ${this.component.name}.`,
        'success',
      );
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
    return this.isServerConnected(this.currentConnectionState);
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

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }

  private isServerConnected(state: string | null): boolean {
    return state === 'subscribed' || state === 'connected';
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
    this.mqttService.setActiveDevice(device.code);
    return true;
  }
}
