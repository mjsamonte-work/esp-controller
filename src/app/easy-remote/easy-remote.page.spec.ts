import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { EasyRemotePage } from './easy-remote.page';
import { MqttService } from '../services/mqtt.service';

describe('EasyRemotePage', () => {
  let component: EasyRemotePage;
  let fixture: ComponentFixture<EasyRemotePage>;
  let mqttService: jasmine.SpyObj<MqttService>;

  beforeEach(async () => {
    mqttService = jasmine.createSpyObj<MqttService>(
      'MqttService',
      ['publishState'],
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

    await TestBed.configureTestingModule({
      imports: [EasyRemotePage],
      providers: [provideRouter([]), { provide: MqttService, useValue: mqttService }],
    }).compileComponents();

    fixture = TestBed.createComponent(EasyRemotePage);
    component = fixture.componentInstance;
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
    await fixture.whenStable();

    expect(mqttService.publishState).toHaveBeenCalledWith('ON');
  });

  it('shows connected state when subscription is active', () => {
    expect(fixture.nativeElement.textContent).toContain('Connected');
  });

  it('shows the activity log below the controls', () => {
    expect(fixture.nativeElement.textContent).toContain('Activity Log');
    expect(fixture.nativeElement.textContent).toContain('Message received');
    expect(fixture.nativeElement.textContent).toContain('home/esp1/led/status');
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
});
