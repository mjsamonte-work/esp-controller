import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { HomePage } from './home.page';
import { MqttService } from '../services/mqtt.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let mqttService: jasmine.SpyObj<MqttService>;

  beforeEach(async () => {
    mqttService = jasmine.createSpyObj<MqttService>(
      'MqttService',
      ['publishState'],
      {
        brokerHost: 'broker.example.com',
        brokerPort: 8883,
        publishTopic: 'home/esp1/led/control',
        subscribeTopic: 'home/esp1/led/status',
        state$: of('subscribed'),
        subscribed$: of(true),
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

    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [{ provide: MqttService, useValue: mqttService }],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the ON and OFF buttons', () => {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('ion-button'),
      (button) => (button as HTMLElement).textContent?.trim(),
    );

    expect(buttons).toContain('ON');
    expect(buttons).toContain('OFF');
  });

  it('publishes ON when the ON button is clicked', () => {
    const onButton: HTMLIonButtonElement = fixture.nativeElement.querySelectorAll('ion-button')[0];
    onButton.click();

    expect(mqttService.publishState).toHaveBeenCalledWith('ON');
  });

  it('shows the activity log message', () => {
    expect(fixture.nativeElement.textContent).toContain('Message received');
    expect(fixture.nativeElement.textContent).toContain('home/esp1/led/status');
  });

  it('shows the empty state when there are no logs', async () => {
    mqttService = jasmine.createSpyObj<MqttService>(
      'MqttService',
      ['publishState'],
      {
        brokerHost: 'broker.example.com',
        brokerPort: 8883,
        publishTopic: 'home/esp1/led/control',
        subscribeTopic: 'home/esp1/led/status',
        state$: of('connecting'),
        subscribed$: of(false),
        logs$: of([]),
      },
    );

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [{ provide: MqttService, useValue: mqttService }],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No MQTT activity yet');
  });
});
