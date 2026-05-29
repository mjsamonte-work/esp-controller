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
  let message$: Subject<{ topic: string; payload: Uint8Array; retain?: boolean }>;
  let reconnect$: Subject<void>;
  let mockClient: jasmine.SpyObj<MqttClient>;
  let connectSpy: jasmine.Spy;
  let service: MqttService;

  beforeEach(() => {
    close$ = new Subject<void>();
    connect$ = new Subject<void>();
    error$ = new Subject<Error>();
    message$ = new Subject<{ topic: string; payload: Uint8Array; retain?: boolean }>();
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
        message$.subscribe((message) => handler(message.topic, message.payload, { retain: message.retain ?? false }));
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
      ['devices/esp1/event', 'devices/smart-easy-ph-device/event'],
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('publishes the ON payload to the control topic', () => {
    service.publishState('esp1', 'ON');

    const logs = service['logsSubject'].value;

    expect(logs[0]).toEqual(
      jasmine.objectContaining<MqttLogEntry>({
        direction: 'sent',
        message: 'ON command sent',
        topic: 'devices/esp1/command',
        payload: jasmine.stringMatching(/"state":"ON"/),
      }),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"target":"device"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"state":"ON"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"timestamp":"[^"]+"/),
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('publishes a component payload to the control topic', () => {
    service.publishComponentState('esp1', 'relay-1', 'OFF');

    const logs = service['logsSubject'].value;

    expect(logs[0]).toEqual(
      jasmine.objectContaining<MqttLogEntry>({
        direction: 'sent',
        message: 'OFF command sent for component',
        topic: 'devices/esp1/command',
        payload: jasmine.stringMatching(/"component":"relay-1"/),
      }),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"target":"component"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"state":"OFF"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"component":"relay-1"/),
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('publishes a health check to the device topic', () => {
    service.checkDeviceStatus('esp1');
    connect$.next();

    const logs = service['logsSubject'].value;

    expect(logs[0]).toEqual(
      jasmine.objectContaining<MqttLogEntry>({
        direction: 'sent',
        message: 'Requested device status',
        topic: 'devices/esp1/command',
        payload: jasmine.stringMatching(/"state":"HEALTH"/),
      }),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"target":"device"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"state":"HEALTH"/),
      { qos: 0 },
      jasmine.any(Function),
    );
    expect(mockClient.publish).toHaveBeenCalledWith(
      'devices/esp1/command',
      jasmine.stringMatching(/"timestamp":"[^"]+"/),
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('adds a received log entry for incoming messages', async () => {
    message$.next({
      topic: 'devices/esp1/event',
      payload: new TextEncoder().encode('online'),
    });

    const logs = await firstValueFrom(service.logs$);

    expect(logs[0]).toEqual(
      jasmine.objectContaining<MqttLogEntry>({
        direction: 'received',
        message: 'Message received',
        payload: 'online',
        topic: 'devices/esp1/event',
      }),
    );
  });

  it('tracks the last equipment state when the device reports ON or OFF', async () => {
    service.setActiveDevice('esp1');
    connect$.next();

    let state = 'unknown';
    const subscription = service.equipmentState$.subscribe((value) => {
      state = value;
    });

    message$.next({
      topic: 'devices/esp1/event',
      payload: new TextEncoder().encode(
        JSON.stringify({
          state: 'OFF',
          timestamp: '2026-04-01T00:00:00.000Z',
        }),
      ),
    });

    expect(state).toBe('OFF');
    subscription.unsubscribe();
  });

  it('tracks equipment state updates from the shared device event topic', async () => {
    service.setActiveDevice('esp1');
    connect$.next();

    let state = 'unknown';
    const subscription = service.equipmentState$.subscribe((value) => {
      state = value;
    });

    message$.next({
      topic: 'devices/smart-easy-ph-device/event',
      payload: new TextEncoder().encode(
        JSON.stringify({
          state: 'ON',
          timestamp: '2026-04-01T00:00:00.000Z',
        }),
      ),
    });

    expect(state).toBe('ON');
    subscription.unsubscribe();
  });

  it('tracks component success updates without a timestamp', async () => {
    service.setActiveDevice('esp1');
    connect$.next();

    let state = 'unknown';
    const subscription = service.equipmentState$.subscribe((value) => {
      state = value;
    });

    message$.next({
      topic: 'devices/smart-easy-ph-device/event',
      payload: new TextEncoder().encode(
        JSON.stringify({
          target: 'component',
          component: 'equipment-1',
          state: 'ON',
          deviceCode: 'smart-easy-ph-device',
        }),
      ),
    });

    expect(state).toBe('ON');
    subscription.unsubscribe();
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
        topic: 'devices/esp1/command',
      }),
    );
  });

  it('re-subscribes when the active device changes', () => {
    service.setActiveDevice('esp1');
    connect$.next();
    mockClient.subscribe.calls.reset();

    service.setActiveDevice('esp2');

    expect(mockClient.unsubscribe).toHaveBeenCalledWith('devices/esp1/event');
    expect(mockClient.unsubscribe).toHaveBeenCalledWith('devices/smart-easy-ph-device/event');
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      ['devices/esp2/event', 'devices/smart-easy-ph-device/event'],
      { qos: 0 },
      jasmine.any(Function),
    );
  });

  it('marks the device online when a health reply is received', async () => {
    service.setActiveDevice('esp1');
    connect$.next();
    await service.checkDeviceStatus('esp1');

    message$.next({
      topic: 'devices/esp1/event',
      payload: new TextEncoder().encode(
        JSON.stringify({
          state: 'ONLINE',
        }),
      ),
    });

    const state = await firstValueFrom(service.deviceHealth$);

    expect(state).toBe('online');
  });

  it('ignores retained ONLINE health replies', async () => {
    service.setActiveDevice('esp1');
    connect$.next();
    await service.checkDeviceStatus('esp1');

    message$.next({
      topic: 'devices/esp1/event',
      payload: new TextEncoder().encode(
        JSON.stringify({
          target: 'device',
          state: 'ONLINE',
          deviceCode: 'esp1',
        }),
      ),
      retain: true,
    });

    const state = await firstValueFrom(service.deviceHealth$);

    expect(state).toBe('checking');
  });

  it('ignores stale retained status messages on first load', fakeAsync(() => {
    service.setActiveDevice('esp1');
    connect$.next();

    void service.checkDeviceStatus('esp1');

    message$.next({
      topic: 'devices/esp1/event',
      payload: new TextEncoder().encode(
        JSON.stringify({
          state: 'ON',
          timestamp: '2026-04-01T00:00:00.000Z',
        }),
      ),
    });

    let state!: string;
    service.deviceHealth$.subscribe((value) => {
      state = value;
    });

    expect(state).toBe('checking');

    tick(5001);

    expect(state).toBe('offline');
  }));

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
