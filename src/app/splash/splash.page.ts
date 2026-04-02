import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  imports: [IonContent],
})
export class SplashPage implements OnInit, OnDestroy {
  private navigationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    this.navigationTimer = setTimeout(() => {
      void this.router.navigateByUrl('/home', { replaceUrl: true });
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
      this.navigationTimer = null;
    }
  }
}
