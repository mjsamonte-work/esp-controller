import { Component } from '@angular/core';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { ContactUsComponent } from '../contact-us/contact-us.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    RouterLink,
    ContactUsComponent,
  ],
})
export class HomePage {}
