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
      code: 'esp1',
      location: 'Kitchen',
    });

    expect(service.devices).toEqual([
      {
        code: 'esp1',
        location: 'Kitchen',
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
      code: 'esp1',
      location: 'Kitchen',
    });

    await expectAsync(
      service.addDevice({
        code: 'ESP1',
        location: 'Bedroom',
      }),
    ).toBeRejectedWithError('A device with this code already exists.');
  });

  it('loads stored devices on startup', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    spyOn(Preferences, 'get').and.resolveTo({
      value: JSON.stringify([
        {
          code: 'esp2',
          location: 'Garage',
        },
      ]),
    });
    spyOn(Preferences, 'set').and.resolveTo();
    service = TestBed.inject(DeviceStoreService);
    await service.ready();

    expect(service.devices).toEqual([
      {
        code: 'esp2',
        location: 'Garage',
      },
    ]);
  });

  it('updates the location without changing the device code', async () => {
    await service.ready();
    await service.addDevice({
      code: 'esp1',
      location: 'Kitchen',
    });

    await service.updateDevice('esp1', {
      location: 'Bedroom',
    });

    expect(service.devices).toEqual([
      {
        code: 'esp1',
        location: 'Bedroom',
      },
    ]);
  });

  it('removes a saved device', async () => {
    await service.ready();
    await service.addDevice({
      code: 'esp1',
      location: 'Kitchen',
    });
    await service.addDevice({
      code: 'esp2',
      location: 'Garage',
    });

    await service.removeDevice('esp1');

    expect(service.devices).toEqual([
      {
        code: 'esp2',
        location: 'Garage',
      },
    ]);
    expect(Preferences.set).toHaveBeenCalledWith({
      key: 'easy-remote.devices',
      value: JSON.stringify(service.devices),
    });
  });
});
