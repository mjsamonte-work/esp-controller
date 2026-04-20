import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { DevicesPage } from './devices.page';
import { DeviceStoreService } from '../services/device-store.service';

describe('DevicesPage', () => {
  let component: DevicesPage;
  let fixture: ComponentFixture<DevicesPage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let router: Router;

  beforeEach(async () => {
    deviceStore = jasmine.createSpyObj<DeviceStoreService>(
      'DeviceStoreService',
      ['ready', 'removeDevice'],
      {
        devices$: of([
          {
            name: 'Kitchen Lamp',
            code: 'esp1',
            location: 'Kitchen',
            autoCheckIntervalSeconds: 30,
          },
        ]),
      },
    );
    deviceStore.ready.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [DevicesPage],
      providers: [provideRouter([]), { provide: DeviceStoreService, useValue: deviceStore }],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(DevicesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the device list and add action', () => {
    expect(fixture.nativeElement.textContent).toContain('Select a device to control');
    expect(fixture.nativeElement.textContent).toContain('Kitchen Lamp');
    expect(fixture.nativeElement.textContent).toContain('Add New Device');
  });

  it('opens the create page from the create button', () => {
    component.createDevice();

    expect(router.navigate).toHaveBeenCalledWith(['/devices/new']);
  });

  it('opens the edit page for a selected device', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    component.editDevice(
      {
        name: 'Kitchen Lamp',
        code: 'esp1',
        location: 'Kitchen',
        autoCheckIntervalSeconds: 30,
      },
      event,
    );

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/devices', 'esp1', 'edit']);
  });

  it('removes a selected device', async () => {
    deviceStore.removeDevice.and.resolveTo();
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    await component.removeDevice(
      {
        name: 'Kitchen Lamp',
        code: 'esp1',
        location: 'Kitchen',
        autoCheckIntervalSeconds: 30,
      },
      event,
    );

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(deviceStore.removeDevice).toHaveBeenCalledWith('esp1');
    expect(component.toastOpen).toBeTrue();
    expect(component.toastColor).toBe('success');
  });
});
