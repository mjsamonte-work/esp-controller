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
      },
    ]);
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
      },
    ]);
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
      },
    ]);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'easy-remote.devices',
      value: JSON.stringify(service.devices),
    });
  });
});
