import { AsyncPipe, NgClass, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import {
  IonButton,
  IonIcon,
  IonPopover,
  IonSpinner,
} from '@ionic/angular/standalone';
import { Observable } from 'rxjs';

import { DeviceHealthState } from '../../services/mqtt.service';

@Component({
  selector: 'app-device-status-section',
  templateUrl: 'device-status-section.component.html',
  standalone: true,
  imports: [
    AsyncPipe,
    NgClass,
    NgIf,
    IonButton,
    IonIcon,
    IonPopover,
    IonSpinner,
  ],
})
export class DeviceStatusSectionComponent {
  @Input({ required: true }) deviceHealth$!: Observable<DeviceHealthState | null>;
  @Input({ required: true }) deviceCheckInProgress$!: Observable<boolean | null>;
  @Output() refresh = new EventEmitter<void>();

  @Input() statusLabel = 'Device Status';
  @Input() statusDescription = 'Shows if this device is connected and responding right now.';
  @Input() tooltipContent = 'Device Status tells you if the actual device is connected and responding right now.';
  @Input() tooltipId = 'device-status-tooltip';
  @Input() showCheckButton = true;
  @Input() statusRowClass = '';
  constructor() {
    addIcons({ 'information-circle-outline': informationCircleOutline });
  }

  getStatusLabel(state: DeviceHealthState | null): string {
    switch (state) {
      case 'online':
        return 'Connected - Online';
      case 'offline':
        return 'Offline - Disconnected';
      case 'checking':
        return 'Checking...';
      case 'unknown':
      default:
        return 'Offline - Disconnected';
    }
  }

  getStatusClass(state: DeviceHealthState | null): string {
    switch (state) {
      case 'online':
        return 'status-connected';
      case 'checking':
        return 'status-pending';
      case 'unknown':
      case 'offline':
      default:
        return 'status-disconnected';
    }
  }
}
