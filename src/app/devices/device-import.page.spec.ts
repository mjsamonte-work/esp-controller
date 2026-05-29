import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { DeviceImportPage } from './device-import.page';
import { DeviceStoreService } from '../services/device-store.service';

describe('DeviceImportPage', () => {
  let component: DeviceImportPage;
  let fixture: ComponentFixture<DeviceImportPage>;
  let deviceStore: jasmine.SpyObj<DeviceStoreService>;
  let router: Router;

  beforeEach(async () => {
    deviceStore = jasmine.createSpyObj<DeviceStoreService>('DeviceStoreService', ['ready', 'importDevices']);
    deviceStore.ready.and.resolveTo();
    deviceStore.importDevices.and.resolveTo({
      added: 0,
      updated: 0,
      skipped: 0,
    });

    await TestBed.configureTestingModule({
      imports: [DeviceImportPage],
      providers: [provideRouter([]), { provide: DeviceStoreService, useValue: deviceStore }],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(DeviceImportPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows an error when no file is selected', async () => {
    await component.importDevices();

    expect(component.toastOpen).toBeTrue();
    expect(component.toastColor).toBe('danger');
    expect(deviceStore.importDevices).not.toHaveBeenCalled();
  });

  it('imports a JSON file and navigates back to devices', async () => {
    component.selectedFile = {
      name: 'devices.json',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            devices: [
              {
                name: 'Kitchen Lamp',
                code: 'esp1',
                location: 'Kitchen',
                autoCheckIntervalSeconds: 60,
                components: [
                  {
                    name: 'Relay 1',
                    code: 'relay-1',
                  },
                ],
              },
            ],
          }),
        ),
    } as File;
    component.selectedFileName = 'devices.json';
    deviceStore.importDevices.and.resolveTo({
      added: 1,
      updated: 0,
      skipped: 0,
    });

    await component.importDevices();

    expect(deviceStore.importDevices).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/devices'], {
      state: {
        message: 'Import complete. 1 added.',
      },
    });
  });

  it('downloads a sample JSON file', () => {
    const createObjectUrlSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:sample');
    const revokeObjectUrlSpy = spyOn(URL, 'revokeObjectURL');
    const clickSpy = jasmine.createSpy('click');
    const anchor = {
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement;

    spyOn(document, 'createElement').and.returnValue(anchor);

    component.downloadSampleFile();

    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:sample');
    expect(anchor.download).toBe('device-import-sample.json');
  });
});
