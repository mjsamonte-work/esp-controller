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
      code: 'esp1',
      location: 'Kitchen',
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
      code: 'esp2',
      location: 'Garage',
    });

    await component.saveDevice();

    expect(deviceStore.addDevice).toHaveBeenCalledWith({
      code: 'esp2',
      location: 'Garage',
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
      code: 'esp1',
      location: 'Kitchen',
    });
    expect(component.deviceForm.controls.code.disabled).toBeTrue();
  });
});
