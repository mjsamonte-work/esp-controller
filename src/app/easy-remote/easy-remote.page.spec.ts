import { discardPeriodicTasks, fakeAsync, ComponentFixture, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { EasyRemotePage } from './easy-remote.page';
import { DeviceStoreService } from '../services/device-store.service';
import { MqttService } from '../services/mqtt.service';

describe('EasyRemotePage', () => {
  let component: EasyRemotePage;
  let fixture: ComponentFixture<EasyRemotePage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let mqttService: jasmine.SpyObj<MqttService>;
  let router: Router;
  let connectionState$: BehaviorSubject<'subscribed' | 'disconnected'>;
  let deviceHealth$: BehaviorSubject<'unknown' | 'online' | 'offline' | 'checking'>;
  let deviceCheckInProgress$: BehaviorSubject<boolean>;

  beforeEach(async () => {
    connectionState$ = new BehaviorSubject<'subscribed' | 'disconnected'>('subscribed');
    deviceHealth$ = new BehaviorSubject<'unknown' | 'online' | 'offline' | 'checking'>('unknown');
    deviceCheckInProgress$ = new BehaviorSubject<boolean>(false);
    mqttService = jasmine.createSpyObj<MqttService>(
      'MqttService',
      ['checkDeviceStatus', 'setActiveDevice'],
      {
        state$: connectionState$.asObservable(),
        deviceHealth$: deviceHealth$.asObservable(),
        deviceCheckInProgress$: deviceCheckInProgress$.asObservable(),
        logs$: of([
          {
            direction: 'received',
            message: 'Message received',
            payload: '{"state":"ON"}',
            timestamp: '2026-04-01T00:00:00.000Z',
            topic: 'devices/esp1/event',
          },
        ]),
      },
    );
    mqttService.checkDeviceStatus.and.returnValue(Promise.resolve());
    deviceStore = jasmine.createSpyObj<DeviceStoreService>('DeviceStoreService', [
      'ready',
      'findDevice',
      'updateDeviceAutoCheckInterval',
    ]);
    deviceStore.ready.and.resolveTo();
    deviceStore.updateDeviceAutoCheckInterval.and.resolveTo();
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
      imports: [EasyRemotePage],
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
              }),
            },
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(EasyRemotePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the device and its components', () => {
    expect(fixture.nativeElement.textContent).toContain('Kitchen Lamp');
    expect(fixture.nativeElement.textContent).toContain('Relay 1');
    expect(fixture.nativeElement.textContent).toContain('OPEN');
  });

  it('navigates to the component control page', () => {
    component.openComponent({
      name: 'Relay 1',
      code: 'relay-1',
    });

    expect(router.navigate).toHaveBeenCalledWith(['/easy-remote', 'esp1', 'components', 'relay-1']);
  });

  it('navigates to the add component page', () => {
    component.openComponentForm();

    expect(router.navigate).toHaveBeenCalledWith(['/devices', 'esp1', 'components', 'new']);
  });

  it('shows separate device and server statuses', () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Device Status');
    expect(fixture.nativeElement.textContent).toContain('Server Status');
    expect(fixture.nativeElement.textContent).toContain('Online');
    expect(fixture.nativeElement.textContent).toContain('Connected');
  });

  it('triggers a manual device status check', () => {
    mqttService.checkDeviceStatus.calls.reset();

    const button = fixture.nativeElement.querySelector('.status-check-button') as HTMLButtonElement;
    button.click();

    expect(mqttService.checkDeviceStatus).toHaveBeenCalledWith('esp1');
  });

  it('automatically refreshes device status while the page is open', fakeAsync(() => {
    mqttService.checkDeviceStatus.calls.reset();

    tick(30000);

    expect(mqttService.checkDeviceStatus).toHaveBeenCalledWith('esp1');
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it('redirects to devices when the route code is invalid', async () => {
    deviceStore.findDevice.and.returnValue(undefined);

    fixture = TestBed.createComponent(EasyRemotePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/devices'], {
      state: {
        message: 'Device not found. Please select a saved device.',
      },
    });
  });
});
