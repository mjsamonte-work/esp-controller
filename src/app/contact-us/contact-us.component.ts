import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { callOutline, mailOutline } from 'ionicons/icons';
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

@Component({
  selector: 'app-contact-us',
  standalone: true,
  templateUrl: './contact-us.component.html',
  styleUrls: ['./contact-us.component.scss'],
  imports: [IonIcon, IonItem, IonLabel, IonList],
})
export class ContactUsComponent {
  constructor() {
    addIcons({
      'call-outline': callOutline,
      'mail-outline': mailOutline,
    });
  }
}
