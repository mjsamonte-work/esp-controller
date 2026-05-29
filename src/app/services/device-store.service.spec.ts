import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';

import { DeviceStoreService } from './device-store.service';

describe('DeviceStoreService', () => {
  let service: DeviceStoreService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    spyOn(Preferences, 'get').and.resolveTo({
      value: null,
    });
    spyOn(Preferences, 'set').and.resolveTo();
    service = TestBed.inject(DeviceStoreService);
  });

  it('adds a device and persists it', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 60,
    });

    expect(service.devices).toEqual([
      {
        name: 'Kitchen Lamp',
        code: 'esp1',
        location: 'Kitchen',
        autoCheckIntervalSeconds: 60,
        components: [],
      },
    ]);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'easy-remote.devices',
      value: JSON.stringify(service.devices),
    });
  });

  it('rejects duplicate device codes', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
    });

    await expectAsync(
      service.addDevice({
        name: 'Bedroom Lamp',
        code: 'ESP1',
        location: 'Bedroom',
        autoCheckIntervalSeconds: 60,
      }),
    ).toBeRejectedWithError('A device with this code already exists.');
  });

  it('loads stored devices on startup', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    spyOn(Preferences, 'get').and.resolveTo({
      value: JSON.stringify([
        {
          name: 'Garage Door',
          code: 'esp2',
          location: 'Garage',
          autoCheckIntervalSeconds: 120,
        },
      ]),
    });
    spyOn(Preferences, 'set').and.resolveTo();
    service = TestBed.inject(DeviceStoreService);
    await service.ready();

    expect(service.devices).toEqual([
      {
        name: 'Garage Door',
        code: 'esp2',
        location: 'Garage',
        autoCheckIntervalSeconds: 120,
        components: [],
      },
    ]);
  });

  it('seeds the default devices when storage is empty', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    spyOn(Preferences, 'get').and.resolveTo({
      value: null,
    });
    spyOn(Preferences, 'set').and.resolveTo();
    service = TestBed.inject(DeviceStoreService);
    await service.ready();

    expect(service.devices).toEqual([
      {
        name: 'SMART EASY PH DEVICE',
        code: 'smart-easy-ph-device',
        location: 'Living Room',
        autoCheckIntervalSeconds: 30,
        components: [
          {
            name: 'Equipment 1',
            code: 'equipment-1',
          },
          {
            name: 'Equipment 2',
            code: 'equipment-2',
          },
          {
            name: 'Equipment 3',
            code: 'equipment-3',
          },
          {
            name: 'Equipment 4',
            code: 'equipment-4',
          },
          {
            name: 'Equipment 5',
            code: 'equipment-5',
          },
        ],
      },
    ]);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'easy-remote.devices',
      value: JSON.stringify(service.devices),
    });
  });

  it('updates the location without changing the device code', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
    });

    await service.updateDevice('esp1', {
      name: 'Kitchen Lamp v2',
      location: 'Bedroom',
      autoCheckIntervalSeconds: 240,
    });

    expect(service.devices).toEqual([
      {
        name: 'Kitchen Lamp v2',
        code: 'esp1',
        location: 'Bedroom',
        autoCheckIntervalSeconds: 240,
        components: [],
      },
    ]);
  });

  it('updates a device auto-check interval and persists it', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
    });

    await service.updateDeviceAutoCheckInterval('esp1', 240);

    expect(service.devices).toEqual([
      {
        name: 'Kitchen Lamp',
        code: 'esp1',
        location: 'Kitchen',
        autoCheckIntervalSeconds: 240,
        components: [],
      },
    ]);
  });

  it('updates device components and persists them', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
    });

    await service.updateDeviceComponents('esp1', [
      {
        name: 'Relay 1',
        code: 'relay-1',
      },
    ]);

    expect(service.devices).toEqual([
      {
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
      },
    ]);
  });

  it('imports devices and merges components without removing existing devices', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
    });

    const result = await service.importDevices({
      devices: [
        {
          name: 'Kitchen Lamp v2',
          code: 'ESP1',
          location: 'Bedroom',
          autoCheckIntervalSeconds: 240,
          components: [
            {
              name: 'Relay 1',
              code: 'relay-1',
            },
            {
              name: 'Relay 1 duplicate',
              code: 'relay-1',
            },
          ],
        },
        {
          name: 'Garage Door',
          code: 'esp2',
          location: 'Garage',
          autoCheckIntervalSeconds: 120,
          components: [
            {
              name: 'Gate',
              code: 'gate-1',
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      added: 1,
      updated: 1,
      skipped: 0,
    });
    expect(service.devices).toEqual([
      {
        name: 'Kitchen Lamp v2',
        code: 'ESP1',
        location: 'Bedroom',
        autoCheckIntervalSeconds: 240,
        components: [
          {
            name: 'Relay 1',
            code: 'relay-1',
          },
        ],
      },
      {
        name: 'Garage Door',
        code: 'esp2',
        location: 'Garage',
        autoCheckIntervalSeconds: 120,
        components: [
          {
            name: 'Gate',
            code: 'gate-1',
          },
        ],
      },
    ]);
  });

  it('rejects invalid import payloads', async () => {
    await service.ready();

    await expectAsync(service.importDevices({})).toBeRejectedWithError(
      'The imported file does not contain any devices.',
    );
  });

  it('removes a saved device', async () => {
    await service.ready();
    await service.addDevice({
      name: 'Kitchen Lamp',
      code: 'esp1',
      location: 'Kitchen',
      autoCheckIntervalSeconds: 30,
    });
    await service.addDevice({
      name: 'Garage Door',
      code: 'esp2',
      location: 'Garage',
      autoCheckIntervalSeconds: 60,
    });

    await service.removeDevice('esp1');

    expect(service.devices).toEqual([
      {
        name: 'Garage Door',
        code: 'esp2',
        location: 'Garage',
        autoCheckIntervalSeconds: 60,
        components: [],
      },
    ]);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'easy-remote.devices',
      value: JSON.stringify(service.devices),
    });
  });
});
