import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

import { DeviceComponentsPage } from './device-components.page';
import { DeviceStoreService } from '../services/device-store.service';

describe('DeviceComponentsPage', () => {
  let component: DeviceComponentsPage;
  let fixture: ComponentFixture<DeviceComponentsPage>;
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
      components: [],
    });

    await TestBed.configureTestingModule({
      imports: [DeviceComponentsPage],
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
    fixture = TestBed.createComponent(DeviceComponentsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the device name', () => {
    expect(fixture.nativeElement.textContent).toContain('Kitchen Lamp');
    expect(fixture.nativeElement.textContent).toContain('No components added yet.');
  });

  it('navigates to the add component page', () => {
    component.addComponent();

    expect(router.navigate).toHaveBeenCalledWith(['/devices', 'esp1', 'components', 'new']);
  });

  it('navigates to the component control page', () => {
    component.openComponent({
      name: 'Relay 1',
      code: 'relay-1',
    });

    expect(router.navigate).toHaveBeenCalledWith(['/easy-remote', 'esp1', 'components', 'relay-1']);
  });

  it('navigates to the edit component page', () => {
    component.editComponent('relay-1');

    expect(router.navigate).toHaveBeenCalledWith(['/devices', 'esp1', 'components', 'relay-1', 'edit']);
  });

  it('opens a confirmation before removing a component', async () => {
    component.components = [
      {
        name: 'Relay 1',
        code: 'relay-1',
      },
    ];

    component.removeComponent('relay-1');

    expect(component.removeConfirmOpen).toBeTrue();
    expect(component.pendingRemoveComponentCode).toBe('relay-1');

    await component.confirmRemoveComponent();

    expect(deviceStore.updateDeviceComponents).toHaveBeenCalledWith('esp1', []);
    expect(component.toastColor).toBe('success');
  });
});
