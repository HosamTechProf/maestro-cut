import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ProjectStateService } from '../../core/services/project-state.service';
import { DesktopBridgeService } from '../../core/services/desktop-bridge.service';
import { RESOLUTION_PRESETS, Resolution } from '../../core/models/project-state.model';
import { TimeFormatPipe } from '../../shared/pipes/time-format.pipe';

export type ExportStage = 'config' | 'exporting' | 'complete' | 'error';

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [FormsModule, DecimalPipe, TimeFormatPipe],
  templateUrl: './export-dialog.component.html',
  styleUrl: './export-dialog.component.css',
})
export class ExportDialogComponent implements OnDestroy {
  readonly stateService = inject(ProjectStateService);
  private readonly bridge = inject(DesktopBridgeService);

  // Dialog visibility
  readonly isOpen = signal(false);

  // Config form state
  readonly format = signal<'mp4' | 'webm' | 'mov' | 'avi'>('mp4');
  readonly quality = signal<'low' | 'medium' | 'high' | 'lossless'>('high');
  readonly selectedResolutionIndex = signal(2); // 1080p default
  readonly frameRate = signal(30);
  readonly audioBitrate = signal('192k');
  readonly outputPath = signal('');

  // Export progress state
  readonly stage = signal<ExportStage>('config');
  readonly progress = signal(0);
  readonly currentTime = signal(0);
  readonly totalDuration = signal(0);
  readonly exportFps = signal(0);
  readonly speed = signal('0x');
  readonly errorMessage = signal('');

  // Computed
  readonly resolutionPresets = RESOLUTION_PRESETS;
  readonly selectedResolution = computed(() => this.resolutionPresets[this.selectedResolutionIndex()]);
  readonly isExporting = computed(() => this.stage() === 'exporting');

  // Estimated file size (rough)
  readonly estimatedSize = computed(() => {
    const duration = this.stateService.totalDuration();
    const res = this.selectedResolution();
    const qualityMap: Record<string, number> = { low: 1, medium: 3, high: 6, lossless: 20 };
    const mbps = qualityMap[this.quality()] || 6;
    return Math.round(duration * mbps * (res.width * res.height) / (1920 * 1080));
  });

  /** Open the export dialog. */
  open(): void {
    this.stage.set('config');
    this.progress.set(0);
    this.errorMessage.set('');
    this.isOpen.set(true);

    // Register progress listener
    this.bridge.onExportProgress((data) => {
      this.progress.set(data.percent);
      this.currentTime.set(data.currentTime);
      this.totalDuration.set(data.totalDuration);
      this.exportFps.set(data.fps);
      this.speed.set(data.speed);

      if (data.stage === 'complete') {
        this.stage.set('complete');
      } else if (data.stage === 'error') {
        this.stage.set('error');
      }
    });
  }

  /** Close the dialog. */
  close(): void {
    if (this.isExporting()) {
      // Confirm cancel
      if (!confirm('Export is in progress. Cancel?')) return;
      this.cancelExport();
    }
    this.bridge.removeExportProgressListener();
    this.isOpen.set(false);
  }

  /** Browse for output file path. */
  async browseOutputPath(): Promise<void> {
    const result = await this.bridge.exportFileDialog();
    if (!result.canceled && result.filePath) {
      this.outputPath.set(result.filePath);
      // Auto-detect format from extension
      const ext = result.filePath.split('.').pop()?.toLowerCase();
      if (ext && ['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
        this.format.set(ext as any);
      }
    }
  }

  /** Start the export. */
  async startExport(): Promise<void> {
    if (!this.outputPath()) {
      await this.browseOutputPath();
      if (!this.outputPath()) return;
    }

    this.stage.set('exporting');
    this.progress.set(0);
    this.errorMessage.set('');

    try {
      const config = {
        state: this.stateService.serialize(),
        outputPath: this.outputPath(),
        format: this.format(),
        resolution: this.selectedResolution(),
        quality: this.quality(),
        frameRate: this.frameRate(),
        audioBitrate: this.audioBitrate(),
      };

      await this.bridge.exportVideo(config);
    } catch (err: any) {
      this.stage.set('error');
      this.errorMessage.set(err?.message ?? 'Export failed');
    }
  }

  /** Cancel an in-progress export. */
  async cancelExport(): Promise<void> {
    await this.bridge.cancelExport();
    this.stage.set('config');
    this.progress.set(0);
  }

  /** Handle resolution dropdown change. */
  onResolutionChange(event: Event): void {
    this.selectedResolutionIndex.set(+(event.target as HTMLSelectElement).value);
  }

  /** Handle format dropdown change. */
  onFormatChange(event: Event): void {
    this.format.set((event.target as HTMLSelectElement).value as any);
  }

  /** Handle quality dropdown change. */
  onQualityChange(event: Event): void {
    this.quality.set((event.target as HTMLSelectElement).value as any);
  }

  /** Handle framerate dropdown change. */
  onFrameRateChange(event: Event): void {
    this.frameRate.set(+(event.target as HTMLSelectElement).value);
  }

  ngOnDestroy(): void {
    this.bridge.removeExportProgressListener();
  }
}
