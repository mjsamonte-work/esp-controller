import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'splash',
    loadComponent: () => import('./splash/splash.page').then((m) => m.SplashPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'easy-remote',
    loadComponent: () => import('./easy-remote/easy-remote.page').then((m) => m.EasyRemotePage),
  },
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full',
  },
];
