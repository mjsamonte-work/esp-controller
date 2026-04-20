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
      ['publishState', 'setActiveDevice', 'checkDeviceStatus'],
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
            topic: 'home/esp1/led/status',
          },
        ]),
      },
    );
    mqttService.publishState.and.returnValue(Promise.resolve());
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

  it('renders the remote control buttons', () => {
    expect(fixture.nativeElement.textContent).toContain('TURN ON');
    expect(fixture.nativeElement.textContent).toContain('TURN OFF');
    expect(fixture.nativeElement.textContent).toContain('CHECK DEVICE STATUS');
    expect(fixture.nativeElement.textContent).toContain('Auto Check');
  });

  it('publishes ON when the turn on button is clicked', async () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('ion-button');
    const onButton = buttons[1] as HTMLIonButtonElement;

    onButton.click();
    fixture.detectChanges();
    await component.confirmStateChange();
    await fixture.whenStable();

    expect(mqttService.publishState).toHaveBeenCalledWith('esp1', 'ON');
  });

  it('shows separate device and server statuses', () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Device Status');
    expect(fixture.nativeElement.textContent).toContain('Server Status');
    expect(fixture.nativeElement.textContent).toContain('Online');
    expect(fixture.nativeElement.textContent).toContain('Connected');
  });

  it('shows the selected device details', () => {
    expect(fixture.nativeElement.textContent).toContain('Kitchen Lamp');
    expect(fixture.nativeElement.textContent).toContain('Code');
    expect(fixture.nativeElement.textContent).toContain('esp1');
    expect(fixture.nativeElement.textContent).toContain('Location');
    expect(fixture.nativeElement.textContent).toContain('Kitchen');
    expect(fixture.nativeElement.textContent).not.toContain('Selected Device');
    expect(mqttService.setActiveDevice).toHaveBeenCalledWith('esp1');
    expect(mqttService.checkDeviceStatus).toHaveBeenCalledWith('esp1');
  });

  it('does not show the contact us section', () => {
    expect(fixture.nativeElement.textContent).not.toContain('CONTACT US');
    expect(fixture.nativeElement.textContent).not.toContain('easyuansph@gmail.com');
    expect(fixture.nativeElement.textContent).not.toContain('09063071291');
  });

  it('disables the buttons while submitting and shows a success toast', async () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    let resolvePublish!: () => void;
    mqttService.publishState.and.returnValue(
      new Promise<void>((resolve) => {
        resolvePublish = resolve;
      }),
    );

    const onButton = fixture.nativeElement.querySelectorAll('ion-button')[1] as HTMLIonButtonElement;
    onButton.click();
    fixture.detectChanges();
    await component.confirmStateChange();
    fixture.detectChanges();

    expect(component.isSubmitting).toBeTrue();
    expect(component.submittingState).toBe('ON');
    expect(fixture.nativeElement.textContent).toContain('LOADING...');

    resolvePublish();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isSubmitting).toBeFalse();
    expect(component.submittingState).toBeNull();
    expect(component.toastOpen).toBeTrue();
    expect(component.toastColor).toBe('success');
    expect(component.toastMessage).toContain('completed');
  });

  it('opens a confirmation alert before publishing', () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    component.requestStateChange('OFF');

    expect(component.confirmAlertOpen).toBeTrue();
    expect(component.pendingState).toBe('OFF');
    expect(component.confirmHeader).toBe('Confirm Turn Off');
    expect(component.confirmMessage).toContain('turn the remote off');
  });

  it('does not publish when the user cancels the confirmation', () => {
    deviceHealth$.next('online');
    fixture.detectChanges();

    component.requestStateChange('ON');
    component.cancelStateChange();

    expect(component.confirmAlertOpen).toBeFalse();
    expect(component.pendingState).toBeNull();
    expect(mqttService.publishState).not.toHaveBeenCalled();
  });

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

  it('disables the control buttons until the device is online', () => {
    const buttons = fixture.nativeElement.querySelectorAll('ion-button');
    const onButton = buttons[1] as HTMLIonButtonElement;
    const offButton = buttons[2] as HTMLIonButtonElement;

    expect(component.canSendDeviceCommand).toBeFalse();
    expect(onButton.disabled).toBeTrue();
    expect(offButton.disabled).toBeTrue();

    deviceHealth$.next('online');
    fixture.detectChanges();

    expect(component.canSendDeviceCommand).toBeTrue();
    expect(onButton.disabled).toBeFalse();
    expect(offButton.disabled).toBeFalse();
  });

  it('triggers a manual device status check', () => {
    mqttService.checkDeviceStatus.calls.reset();

    const button = fixture.nativeElement.querySelectorAll('ion-button')[0] as HTMLIonButtonElement;
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

  it('resets the auto-refresh timer after a manual status check', fakeAsync(() => {
    mqttService.checkDeviceStatus.calls.reset();

    const button = fixture.nativeElement.querySelectorAll('ion-button')[0] as HTMLIonButtonElement;
    tick(15000);

    button.click();
    fixture.detectChanges();

    expect(mqttService.checkDeviceStatus).toHaveBeenCalledTimes(1);

    tick(29999);
    expect(mqttService.checkDeviceStatus).toHaveBeenCalledTimes(1);

    tick(1);
    expect(mqttService.checkDeviceStatus).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it('saves the selected auto-check interval and uses it for polling', fakeAsync(() => {
    component.selectedAutoCheckIntervalSeconds = 30;
    fixture.detectChanges();

    void component.updateAutoCheckInterval(
      new CustomEvent('ionChange', {
        detail: {
          value: 120,
        },
      }),
    );

    expect(deviceStore.updateDeviceAutoCheckInterval).toHaveBeenCalledWith('esp1', 120);
    expect(component.selectedAutoCheckIntervalSeconds).toBe(120);

    mqttService.checkDeviceStatus.calls.reset();

    tick(119999);
    expect(mqttService.checkDeviceStatus).not.toHaveBeenCalled();

    tick(1);
    expect(mqttService.checkDeviceStatus).toHaveBeenCalledWith('esp1');
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));
});
