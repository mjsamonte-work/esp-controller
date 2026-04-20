import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { DeviceFormPage } from './device-form.page';
import { DeviceStoreService } from '../services/device-store.service';

describe('DeviceFormPage', () => {
  let component: DeviceFormPage;
  let fixture: ComponentFixture<DeviceFormPage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let router: Router;

  beforeEach(async () => {
    deviceStore = jasmine.createSpyObj<DeviceStoreService>(
      'DeviceStoreService',
      ['ready', 'addDevice', 'updateDevice', 'findDevice'],
    );
    deviceStore.ready.and.resolveTo();
    deviceStore.addDevice.and.resolveTo();
    deviceStore.updateDevice.and.resolveTo();
    deviceStore.findDevice.and.returnValue({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 60,
    });

    await TestBed.configureTestingModule({
      imports: [DeviceFormPage],
      providers: [
        provideRouter([]),
        { provide: DeviceStoreService, useValue: deviceStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(DeviceFormPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('creates a new device', async () => {
    component.deviceForm.setValue({
      name: 'Garage Door',
      code: 'esp2',
      location: 'Garage',
      autoCheckIntervalSeconds: 120,
    });

    await component.saveDevice();

    expect(deviceStore.addDevice).toHaveBeenCalledWith({
      name: 'Garage Door',
      code: 'esp2',
      location: 'Garage',
      autoCheckIntervalSeconds: 120,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/devices'], {
      state: {
        message: 'Device added successfully.',
      },
    });
  });

  it('loads an existing device for editing and keeps the code disabled', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DeviceFormPage],
      providers: [
        provideRouter([]),
        { provide: DeviceStoreService, useValue: deviceStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                deviceCode: 'esp1',
              }),
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(DeviceFormPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isEditMode).toBeTrue();
    expect(component.deviceForm.getRawValue()).toEqual({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 60,
    });
    expect(component.deviceForm.controls.code.disabled).toBeTrue();
  });
});
