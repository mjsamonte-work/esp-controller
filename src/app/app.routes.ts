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
    path: 'devices',
    loadComponent: () => import('./devices/devices.page').then((m) => m.DevicesPage),
  },
  {
    path: 'devices/new',
    loadComponent: () => import('./devices/device-form.page').then((m) => m.DeviceFormPage),
  },
  {
    path: 'devices/:deviceCode/edit',
    loadComponent: () => import('./devices/device-form.page').then((m) => m.DeviceFormPage),
  },
  {
    path: 'easy-remote',
    redirectTo: 'devices',
    pathMatch: 'full',
  },
  {
    path: 'easy-remote/:deviceCode',
    loadComponent: () => import('./easy-remote/easy-remote.page').then((m) => m.EasyRemotePage),
  },
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full',
  },
];
