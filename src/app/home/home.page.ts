import { AsyncPipe, DatePipe, NgClass, NgFor, NgIf, UpperCasePipe } from '@angular/common';
import { Component } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { MqttService } from '../services/mqtt.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    AsyncPipe,
    DatePipe,
    NgClass,
    NgFor,
    NgIf,
    UpperCasePipe,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonChip,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
})
export class HomePage {
  readonly brokerHost = this.mqttService.brokerHost;
  readonly brokerPort = this.mqttService.brokerPort;
  readonly publishTopic = this.mqttService.publishTopic;
  readonly subscribeTopic = this.mqttService.subscribeTopic;
  readonly connectionState$ = this.mqttService.state$;
  readonly subscribed$ = this.mqttService.subscribed$;
  readonly logs$ = this.mqttService.logs$;

  constructor(private readonly mqttService: MqttService) {}

  sendState(state: 'ON' | 'OFF'): void {
    this.mqttService.publishState(state);
  }
}
