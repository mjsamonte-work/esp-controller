import { AsyncPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { addIcons } from 'ionicons';
import { addOutline, chevronBackOutline, chevronForwardOutline, createOutline, eyeOutline, trashOutline } from 'ionicons/icons';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  IonAlert,
  IonButton,
  IonBadge,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
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
  type DeviceComponent,
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
  showAddComponentAction = false;
  showEditComponentAction = true;
  showDeleteComponentAction = false;
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
  componentRemoveConfirmOpen = false;
  pendingRemoveComponentCode = '';
  pendingRemoveComponentName = '';
  readonly componentRemoveConfirmButtons = [
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
  device: Device | null = null;
  private routeDeviceCode = '';
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
      'add-outline': addOutline,
      'chevron-back-outline': chevronBackOutline,
      'chevron-forward-outline': chevronForwardOutline,
      'create-outline': createOutline,
      'eye-outline': eyeOutline,
      'trash-outline': trashOutline,
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

    this.routeDeviceCode = this.route.snapshot.paramMap.get('deviceCode') ?? '';

    if (!(await this.loadDevice(true))) {
      return;
    }

    await this.refreshDeviceStatus();
    this.startAutoRefresh();
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.routeDeviceCode) {
      return;
    }

    await this.loadDevice(false);
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
    return this.device?.code ?? this.routeDeviceCode;
  }

  get deviceName(): string {
    return this.device?.name ?? '';
  }

  get deviceLocation(): string {
    return this.device?.location ?? '';
  }

  get components(): DeviceComponent[] {
    return this.device?.components ?? [];
  }

  get canSendDeviceCommand(): boolean {
    return this.isServerConnected(this.currentConnectionState);
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

  openComponent(component: DeviceComponent): void {
    if (!this.device) {
      return;
    }

    void this.router.navigate(['/easy-remote', this.device.code, 'components', component.code]);
  }

  editComponent(component: DeviceComponent): void {
    if (!this.showEditComponentAction || !this.device) {
      return;
    }

    void this.router.navigate(['/devices', this.device.code, 'components', component.code, 'edit']);
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
    this.componentRemoveConfirmOpen = true;
  }

  cancelRemoveComponent(): void {
    this.componentRemoveConfirmOpen = false;
    this.pendingRemoveComponentCode = '';
    this.pendingRemoveComponentName = '';
  }

  async confirmRemoveComponent(): Promise<void> {
    if (!this.device || !this.pendingRemoveComponentCode) {
      return;
    }

    const normalizedCode = this.pendingRemoveComponentCode.trim().toLowerCase();
    const nextComponents = this.components.filter(
      (component) => component.code.trim().toLowerCase() !== normalizedCode,
    );

    try {
      await this.deviceStore.updateDeviceComponents(this.device.code, nextComponents);
      this.device = {
        ...this.device,
        components: nextComponents,
      };
      this.presentToast('Component removed successfully.', 'success');
      this.cancelRemoveComponent();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove the component.';
      this.presentToast(message, 'danger');
    }
  }

  openComponentForm(): void {
    if (!this.showAddComponentAction || !this.device) {
      return;
    }

    void this.router.navigate(['/devices', this.device.code, 'components', 'new']);
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

  get componentRemoveConfirmMessage(): string {
    return this.pendingRemoveComponentName
      ? `Are you sure you want to remove ${this.pendingRemoveComponentName}?`
      : 'Are you sure you want to remove this component?';
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

    this.device = device;
    this.selectedAutoCheckIntervalSeconds = device.autoCheckIntervalSeconds;
    this.mqttService.setActiveDevice(device.code);
    return true;
  }
}
