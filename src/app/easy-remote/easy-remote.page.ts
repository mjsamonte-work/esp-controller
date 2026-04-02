import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf, UpperCasePipe } from '@angular/common';
import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  IonToast,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { MqttService } from '../services/mqtt.service';

@Component({
  selector: 'app-easy-remote',
  templateUrl: 'easy-remote.page.html',
  styleUrls: ['easy-remote.page.scss'],
  imports: [
    AsyncPipe,
    DatePipe,
    NgClass,
    NgFor,
    NgIf,
    UpperCasePipe,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSpinner,
    IonToast,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
})
export class EasyRemotePage {
  readonly connectionState$ = this.mqttService.state$;
  readonly logs$ = this.mqttService.logs$;
  isSubmitting = false;
  submittingState: 'ON' | 'OFF' | null = null;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';

  constructor(private readonly mqttService: MqttService) {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
    });
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

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
