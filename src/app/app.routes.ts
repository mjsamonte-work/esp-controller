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
    path: 'devices/import',
    loadComponent: () => import('./devices/device-import.page').then((m) => m.DeviceImportPage),
  },
  {
    path: 'devices/scan',
    loadComponent: () => import('./devices/device-scan.page').then((m) => m.DeviceScanPage),
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
    path: 'devices/:deviceCode/components',
    loadComponent: () =>
      import('./devices/device-components.page').then((m) => m.DeviceComponentsPage),
  },
  {
    path: 'devices/:deviceCode/components/new',
    loadComponent: () =>
      import('./devices/device-component-form.page').then((m) => m.DeviceComponentFormPage),
  },
  {
    path: 'devices/:deviceCode/components/:componentCode/edit',
    loadComponent: () =>
      import('./devices/device-component-form.page').then((m) => m.DeviceComponentFormPage),
  },
  {
    path: 'easy-remote/:deviceCode/components/:componentCode',
    loadComponent: () =>
      import('./easy-remote/component-control.page').then((m) => m.ComponentControlPage),
  },
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full',
  },
];
