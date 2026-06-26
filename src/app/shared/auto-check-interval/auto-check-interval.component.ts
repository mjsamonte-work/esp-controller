import { NgFor } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonPopover,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';

import { type AutoCheckIntervalSeconds } from '../../models/device.model';

@Component({
  selector: 'app-auto-check-interval',
  templateUrl: 'auto-check-interval.component.html',
  standalone: true,
  imports: [
    NgFor,
    IonIcon,
    IonItem,
    IonLabel,
    IonPopover,
    IonSelect,
    IonSelectOption,
  ],
})
export class AutoCheckIntervalComponent {
  @Input({ required: true }) value!: AutoCheckIntervalSeconds;
  @Input() options: readonly AutoCheckIntervalSeconds[] = [30, 60, 120, 240, 580];
  @Input() tooltipId = 'auto-check-tooltip';
  @Input() tooltipContent =
    'Auto Check looks at your device from time to time so you can quickly see if it is still online and ready to use.';
  @Input() helpText = 'Set how often the app should check if this device is still connected.';
  @Output() valueChange = new EventEmitter<AutoCheckIntervalSeconds>();

  constructor() {
    addIcons({ 'information-circle-outline': informationCircleOutline });
  }

  onIntervalChange(event: CustomEvent<{ value: number | string | null }>): void {
    const nextValue = Number(event.detail.value) as AutoCheckIntervalSeconds;
    this.valueChange.emit(nextValue);
  }
}
