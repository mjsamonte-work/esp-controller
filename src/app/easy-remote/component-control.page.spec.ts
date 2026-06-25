import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { ComponentControlPage } from './component-control.page';
import { DeviceStoreService } from '../services/device-store.service';
import { MqttService } from '../services/mqtt.service';

describe('ComponentControlPage', () => {
  let component: ComponentControlPage;
  let fixture: ComponentFixture<ComponentControlPage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let mqttService: jasmine.SpyObj<MqttService>;
  let router: Router;
  let connectionState$: BehaviorSubject<'subscribed' | 'disconnected'>;
  let deviceHealth$: BehaviorSubject<'unknown' | 'online' | 'offline' | 'checking'>;
  let componentHealth$: BehaviorSubject<'unknown' | 'online' | 'offline' | 'checking'>;
  let equipmentState$: BehaviorSubject<'unknown' | 'ON' | 'OFF'>;

  beforeEach(async () => {
    connectionState$ = new BehaviorSubject<'subscribed' | 'disconnected'>('subscribed');
    deviceHealth$ = new BehaviorSubject<'unknown' | 'online' | 'offline' | 'checking'>('unknown');
    componentHealth$ = new BehaviorSubject<'unknown' | 'online' | 'offline' | 'checking'>('unknown');
    equipmentState$ = new BehaviorSubject<'unknown' | 'ON' | 'OFF'>('unknown');
    mqttService = jasmine.createSpyObj<MqttService>(
      'MqttService',
      ['publishComponentState', 'setActiveComponent', 'checkDeviceStatus', 'checkComponentStatus'],
      {
        state$: connectionState$.asObservable(),
        deviceHealth$: deviceHealth$.asObservable(),
        componentHealth$: componentHealth$.asObservable(),
        equipmentState$: equipmentState$.asObservable(),
      },
    );
    mqttService.publishComponentState.and.resolveTo();
    mqttService.checkDeviceStatus.and.resolveTo();
    mqttService.checkComponentStatus.and.resolveTo();
    deviceStore = jasmine.createSpyObj<DeviceStoreService>('DeviceStoreService', ['ready', 'findDevice']);
    deviceStore.ready.and.resolveTo();
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
      imports: [ComponentControlPage],
      providers: [
        provideRouter([]),
        { provide: MqttService, useValue: mqttService },
        { provide: DeviceStoreService, useValue: deviceStore },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                deviceCode: 'esp1',
                componentCode: 'relay-1',
              }),
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(ComponentControlPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the selected component', () => {
    expect(fixture.nativeElement.textContent).toContain('Relay 1');
    expect(fixture.nativeElement.textContent).toContain('SWITCH');
  });

  it('publishes a component switch command', async () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    component.requestSwitch();
    fixture.detectChanges();
    await component.confirmStateChange();

    expect(mqttService.publishComponentState).toHaveBeenCalledWith('esp1', 'relay-1', 'ON');
  });

  it('checks device health if no response arrives after sending a command', fakeAsync(() => {
    deviceHealth$.next('online');
    fixture.detectChanges();
    mqttService.checkDeviceStatus.calls.reset();

    component.requestSwitch();
    fixture.detectChanges();
    void component.confirmStateChange();

    tick(5000);

    expect(mqttService.checkDeviceStatus).toHaveBeenCalledWith('esp1');
  }));

  it('checks status when the page opens', () => {
    expect(mqttService.checkDeviceStatus).toHaveBeenCalledWith('esp1');
    expect(mqttService.checkComponentStatus).toHaveBeenCalledWith('esp1', 'relay-1');
  });

  it('shows a confirmation alert before turning on or off', () => {
    deviceHealth$.next('online');
    component.requestSwitch();
    fixture.detectChanges();

    expect(component.confirmAlertOpen).toBeTrue();
    expect(component.confirmHeader).toBe('Confirm Switch On');
    expect(component.confirmMessage).toContain('turn on Relay 1');
    expect(mqttService.setActiveComponent).toHaveBeenCalledWith('esp1', 'relay-1');
  });

  it('uses a confirmation alert before switching off when the component is on', () => {
    deviceHealth$.next('online');
    equipmentState$.next('ON');
    component.requestSwitch();
    fixture.detectChanges();

    expect(component.confirmAlertOpen).toBeTrue();
    expect(component.confirmHeader).toBe('Confirm Switch Off');
    expect(component.confirmMessage).toContain('turn off Relay 1');
  });

  it('disables action buttons when the server is disconnected', () => {
    connectionState$.next('disconnected');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.action-button') as NodeListOf<HTMLButtonElement>;

    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('disables action buttons when the device is offline', () => {
    deviceHealth$.next('offline');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.action-button') as NodeListOf<HTMLButtonElement>;

    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('disables action buttons when the device health is checking', () => {
    deviceHealth$.next('checking');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('.action-button') as NodeListOf<HTMLButtonElement>;

    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('shows checking while the component health check is pending', () => {
    componentHealth$.next('checking');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Checking...');
  });

  it('redirects away when the component cannot be found', async () => {
    deviceStore.findDevice.and.returnValue({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
      components: [],
    });

    fixture = TestBed.createComponent(ComponentControlPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/easy-remote', 'esp1'], {
      state: {
        message: 'Component not found. Please select a saved component.',
      },
    });
  });
});
