import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject, firstValueFrom } from 'rxjs';
import type { IClientOptions, ISubscriptionGrant, MqttClient } from 'mqtt';

import {
  MQTT_CONNECT,
  MqttLogEntry,
  MqttService,
} from './mqtt.service';

describe('MqttService', () => {
  let close$: Subject<void>;
  let connect$: Subject<void>;
  let error$: Subject<Error>;
  let message$: Subject<{ topic: string; payload: Uint8Array }>;
  let reconnect$: Subject<void>;
  let mockClient: jasmine.SpyObj<MqttClient>;
  let connectSpy: jasmine.Spy;
  let service: MqttService;

  beforeEach(() => {
    close$ = new Subject<void>();
    connect$ = new Subject<void>();
    error$ = new Subject<Error>();
    message$ = new Subject<{ topic: string; payload: Uint8Array }>();
    reconnect$ = new Subject<void>();

    mockClient = jasmine.createSpyObj<MqttClient>('MqttClient', [
      'on',
      'publish',
      'subscribe',
      'unsubscribe',
    ]);

    mockClient.on.and.callFake(((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'connect') {
        connect$.subscribe(() => handler(false));
      }

      if (event === 'close') {
        close$.subscribe(() => handler());
      }

      if (event === 'reconnect') {
        reconnect$.subscribe(() => handler());
      }

      if (event === 'error') {
        error$.subscribe((error) => handler(error));
      }

      if (event === 'message') {
        message$.subscribe((message) => handler(message.topic, message.payload));
      }

      return mockClient;
    }) as MqttClient['on']);

    mockClient.subscribe.and.callFake(((...args: unknown[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        (callback as (err?: Error | null, granted?: ISubscriptionGrant[]) => void)(null, []);
      }

      return mockClient;
    }) as MqttClient['subscribe']);

    mockClient.publish.and.callFake(((...args: unknown[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        (callback as (error?: Error) => void)(undefined);
      }

      return mockClient;
    }) as MqttClient['publish']);

    connectSpy = jasmine.createSpy('connectSpy').and.callFake(
      (_url: string, _options: IClientOptions) => mockClient,
    );

    TestBed.configureTestingModule({
      providers: [{ provide: MQTT_CONNECT, useValue: connectSpy }],
    });

    service = TestBed.inject(MqttService);
  });

  it('connects using the configured websocket broker URL', () => {
    expect(connectSpy).toHaveBeenCalledOnceWith(
      'wss://a0d47caf983d432e848a0047897b3ad3.s1.eu.hivemq.cloud:8884/mqtt',
      jasmine.objectContaining({
        username: 'hf5C405x',
        password: '?rkG479!C}rW~98Z',
      }),
    );
  });

  it('subscribes to the status topic after connecting', () => {
    service.setActiveDevice('esp1');
    connect$.next();

    expect(mockClient.subscribe).toHaveBeenCalledWith(
      ['home/esp1/led/status'],
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('publishes the ON payload to the control topic', () => {
    service.publishState('esp1', 'ON');

    expect(mockClient.publish).toHaveBeenCalledWith(
      'home/esp1/led/control',
      jasmine.stringMatching(/"state":"ON"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'home/esp1/led/control',
      jasmine.stringMatching(/"timestamp":"[^"]+"/),
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('publishes a health check to the device topic', () => {
    service.checkDeviceStatus('esp1');
    connect$.next();

    expect(mockClient.publish).toHaveBeenCalledWith(
      'home/esp1/led/control',
      jasmine.stringMatching(/"state":"HEALTH"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'home/esp1/led/control',
      jasmine.stringMatching(/"timestamp":"[^"]+"/),
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('adds a received log entry for incoming messages', async () => {
    message$.next({
      topic: 'home/esp1/led/status',
      payload: new TextEncoder().encode('online'),
    });

    const logs = await firstValueFrom(service.logs$);

    expect(logs[0]).toEqual(
      jasmine.objectContaining<MqttLogEntry>({
        direction: 'received',
        message: 'Message received',
        payload: 'online',
        topic: 'home/esp1/led/status',
      }),
    );
  });

  it('adds an error log entry when publishing fails', async () => {
    mockClient.publish.and.callFake(((...args: unknown[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        (callback as (error?: Error) => void)(new Error('publish failed'));
      }

      return mockClient;
    }) as MqttClient['publish']);

    service.publishState('esp1', 'OFF');

    const logs = await firstValueFrom(service.logs$);

    expect(logs[0]).toEqual(
      jasmine.objectContaining<MqttLogEntry>({
        direction: 'error',
        message: 'Failed to publish OFF command',
        payload: 'publish failed',
        topic: 'home/esp1/led/control',
      }),
    );
  });

  it('re-subscribes when the active device changes', () => {
    service.setActiveDevice('esp1');
    connect$.next();
    mockClient.subscribe.calls.reset();

    service.setActiveDevice('esp2');

    expect(mockClient.unsubscribe).toHaveBeenCalledWith('home/esp1/led/status');
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      ['home/esp2/led/status'],
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('marks the device online when a health reply is received', async () => {
    service.setActiveDevice('esp1');
    connect$.next();
    await service.checkDeviceStatus('esp1');

    message$.next({
      topic: 'home/esp1/led/status',
      payload: new TextEncoder().encode('pong'),
    });

    const state = await firstValueFrom(service.deviceHealth$);

    expect(state).toBe('online');
  });

  it('marks the device offline after a health check timeout', fakeAsync(() => {
    service.setActiveDevice('esp1');
    connect$.next();

    void service.checkDeviceStatus('esp1');
    tick(5001);

    let state!: string;
    service.deviceHealth$.subscribe((value) => {
      state = value;
    });

    expect(state).toBe('offline');
  }));
});
