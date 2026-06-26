import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-device-details-card',
  templateUrl: 'device-details-card.component.html',
  standalone: true,
})
export class DeviceDetailsCardComponent {
  @Input({ required: true }) deviceCode!: string;
  @Input({ required: true }) deviceLocation!: string;
}
