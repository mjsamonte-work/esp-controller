import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { EasyRemotePage } from './easy-remote.page';
import { DeviceStoreService } from '../services/device-store.service';
import { MqttService } from '../services/mqtt.service';

describe('EasyRemotePage', () => {
  let component: EasyRemotePage;
  let fixture: ComponentFixture<EasyRemotePage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let mqttService: jasmine.SpyObj<MqttService>;
  let router: Router;

  beforeEach(async () => {
    mqttService = jasmine.createSpyObj<MqttService>(
      'MqttService',
      ['publishState', 'setActiveDevice'],
      {
        state$: of('subscribed'),
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
    deviceStore = jasmine.createSpyObj<DeviceStoreService>('DeviceStoreService', [
      'ready',
      'findDevice',
    ]);
    deviceStore.ready.and.resolveTo();
    deviceStore.findDevice.and.returnValue({
      code: 'esp1',
      location: 'Kitchen',
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
  });

  it('publishes ON when the turn on button is clicked', async () => {
    const buttons = fixture.nativeElement.querySelectorAll('ion-button');
    const onButton = buttons[0] as HTMLIonButtonElement;

    onButton.click();
    fixture.detectChanges();
    await component.confirmStateChange();
    await fixture.whenStable();

    expect(mqttService.publishState).toHaveBeenCalledWith('esp1', 'ON');
  });

  it('shows connected state when subscription is active', () => {
    expect(fixture.nativeElement.textContent).toContain('Connected');
  });

  it('shows the contact section below the remote controls', () => {
    expect(fixture.nativeElement.textContent).toContain('CONTACT US');
    expect(fixture.nativeElement.textContent).toContain('easyuansph@gmail.com');
    expect(fixture.nativeElement.textContent).toContain('09063071291');
  });

  it('shows the selected device details', () => {
    expect(fixture.nativeElement.textContent).toContain('esp1');
    expect(fixture.nativeElement.textContent).toContain('Kitchen');
    expect(mqttService.setActiveDevice).toHaveBeenCalledWith('esp1');
  });

  it('disables the buttons while submitting and shows a success toast', async () => {
    let resolvePublish!: () => void;
    mqttService.publishState.and.returnValue(
      new Promise<void>((resolve) => {
        resolvePublish = resolve;
      }),
    );

    const onButton = fixture.nativeElement.querySelectorAll('ion-button')[0] as HTMLIonButtonElement;
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
    component.requestStateChange('OFF');

    expect(component.confirmAlertOpen).toBeTrue();
    expect(component.pendingState).toBe('OFF');
    expect(component.confirmHeader).toBe('Confirm Turn Off');
    expect(component.confirmMessage).toContain('turn the remote off');
  });

  it('does not publish when the user cancels the confirmation', () => {
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
});
