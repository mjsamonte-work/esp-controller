import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';
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

import { ContactUsComponent } from '../contact-us/contact-us.component';
import { MqttService } from '../services/mqtt.service';

@Component({
  selector: 'app-easy-remote',
  templateUrl: 'easy-remote.page.html',
  styleUrls: ['easy-remote.page.scss'],
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
    ContactUsComponent,
  ],
})
export class EasyRemotePage {
  readonly connectionState$ = this.mqttService.state$;
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

  constructor(private readonly mqttService: MqttService) {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
    });
  }

  requestStateChange(state: 'ON' | 'OFF'): void {
    if (this.isSubmitting) {
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
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.submittingState = state;

    try {
      await this.mqttService.publishState(state);
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

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
