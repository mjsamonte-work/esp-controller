import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { chevronBackOutline, cloudUploadOutline } from 'ionicons/icons';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { DeviceStoreService } from '../services/device-store.service';

@Component({
  selector: 'app-device-import',
  templateUrl: './device-import.page.html',
  styleUrls: ['./device-import.page.scss'],
  imports: [
    NgFor,
    NgIf,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    RouterLink,
  ],
})
export class DeviceImportPage {
  readonly sampleImportDevices = [
    {
      name: 'SMART EASY PH DEVICE',
      code: 'smart-easy-ph-device',
      location: 'Living Room',
      autoCheckIntervalSeconds: 60,
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
  ];
  selectedFile: File | null = null;
  selectedFileName = '';
  isImporting = false;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';

  constructor(
    private readonly deviceStore: DeviceStoreService,
    private readonly router: Router,
  ) {
    addIcons({
      'chevron-back-outline': chevronBackOutline,
      'cloud-upload-outline': cloudUploadOutline,
    });
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;

    this.selectedFile = file;
    this.selectedFileName = file?.name ?? '';
  }

  async importDevices(): Promise<void> {
    if (!this.selectedFile) {
      this.presentToast('Please choose a JSON file to import.', 'danger');
      return;
    }

    this.isImporting = true;

    try {
      const rawContent = await this.selectedFile.text();
      const payload = JSON.parse(rawContent) as unknown;
      const result = await this.deviceStore.importDevices(payload);
      const summary = this.formatImportSummary(result);

      await this.router.navigate(['/devices'], {
        state: {
          message: `Import complete. ${summary}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import the selected file.';
      this.presentToast(message, 'danger');
    } finally {
      this.isImporting = false;
    }
  }

  closeToast(): void {
    this.toastOpen = false;
  }

  downloadSampleFile(): void {
    const payload = JSON.stringify({ devices: this.sampleImportDevices }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = 'device-import-sample.json';
    anchor.click();

    URL.revokeObjectURL(url);
  }

  get hasSelectedFile(): boolean {
    return this.selectedFile !== null;
  }

  get importButtonLabel(): string {
    return this.isImporting ? 'IMPORTING...' : 'IMPORT JSON FILE';
  }

  getSampleComponentsLabel(index: number): string {
    return this.sampleImportDevices[index].components
      .map((component) => `${component.name} (${component.code})`)
      .join(', ');
  }

  private formatImportSummary(result: { added: number; updated: number; skipped: number }): string {
    const parts: string[] = [];

    if (result.added > 0) {
      parts.push(`${result.added} added`);
    }

    if (result.updated > 0) {
      parts.push(`${result.updated} updated`);
    }

    if (result.skipped > 0) {
      parts.push(`${result.skipped} skipped`);
    }

    return parts.length > 0 ? parts.join(', ') + '.' : 'No changes were made.';
  }

  private presentToast(message: string, color: 'success' | 'danger'): void {
    this.toastMessage = message;
    this.toastColor = color;
    this.toastOpen = true;
  }
}
