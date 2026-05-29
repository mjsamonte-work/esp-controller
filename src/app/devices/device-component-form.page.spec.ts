import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { DeviceComponentFormPage } from './device-component-form.page';
import { DeviceStoreService } from '../services/device-store.service';

describe('DeviceComponentFormPage', () => {
  let component: DeviceComponentFormPage;
  let fixture: ComponentFixture<DeviceComponentFormPage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let router: Router;

  beforeEach(async () => {
    deviceStore = jasmine.createSpyObj<DeviceStoreService>(
      'DeviceStoreService',
      ['ready', 'findDevice', 'updateDeviceComponents'],
    );
    deviceStore.ready.and.resolveTo();
    deviceStore.updateDeviceComponents.and.resolveTo();
    deviceStore.findDevice.and.returnValue({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
      components: [
        {
          name: 'Relay 1',
          code: 'relay-1',
        },
      ],
    });

    await TestBed.configureTestingModule({
      imports: [DeviceComponentFormPage],
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
    fixture = TestBed.createComponent(DeviceComponentFormPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the component add form', () => {
    expect(fixture.nativeElement.textContent).toContain('Kitchen Lamp');
    expect(fixture.nativeElement.textContent).toContain('SAVE COMPONENT');
  });

  it('makes the component code read-only while editing', () => {
    component.originalComponentCode = 'relay-1';
    fixture.detectChanges();

    const componentCodeInput: HTMLIonInputElement | null = fixture.nativeElement.querySelector(
      'ion-input[placeholder="e.g. relay-1"]',
    );

    expect(componentCodeInput?.readonly).toBeTrue();
  });

  it('shows component name before component code', () => {
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('ion-label') as NodeListOf<Element>,
    ).map((label) => label.textContent?.trim());

    expect(labels).toContain('Component Name');
    expect(labels).toContain('Component Code');
    expect(labels.indexOf('Component Name')).toBeLessThan(labels.indexOf('Component Code'));
  });

  it('links back to the current device details page', () => {
    const backButton: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.back-button');

    expect(backButton?.getAttribute('href')).toContain('/easy-remote/esp1');
  });

  it('saves a new component and returns to the device detail page', async () => {
    component.componentName = 'Relay 2';
    component.componentCode = 'relay-2';

    await component.saveComponent();

    expect(deviceStore.updateDeviceComponents).toHaveBeenCalledWith('esp1', [
      {
        name: 'Relay 1',
        code: 'relay-1',
      },
      {
        name: 'Relay 2',
        code: 'relay-2',
      },
    ]);
    expect(router.navigate).toHaveBeenCalledWith(['/easy-remote', 'esp1']);
  });

  it('updates an existing component and returns to the device detail page', async () => {
    component.originalComponentCode = 'relay-1';
    component.componentName = 'Main Relay';
    component.componentCode = 'relay-1';

    await component.saveComponent();

    expect(deviceStore.updateDeviceComponents).toHaveBeenCalledWith('esp1', [
      {
        name: 'Main Relay',
        code: 'relay-1',
      },
    ]);
    expect(router.navigate).toHaveBeenCalledWith(['/easy-remote', 'esp1']);
  });
});
