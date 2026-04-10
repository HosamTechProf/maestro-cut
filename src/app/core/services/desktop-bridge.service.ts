// =============================================================================
// Desktop Bridge Service — Angular ↔ Electron IPC Wrapper
// =============================================================================
// This service provides a typed, injectable wrapper around window.electronAPI.
// All Electron IPC communication from Angular goes through this service.
// Includes graceful fallback for browser-only development (ng serve without Electron).
// =============================================================================

import { Injectable, signal, computed, NgZone, inject } from '@angular/core';
import type {
  ElectronAPI,
  FileDialogResult,
  SaveDialogResult,
  SaveResult,
  LoadResult,
  VideoMetadata,
  ExportConfig,
  ExportProgress,
  AiContext,
  AiEditResponse,
  SerializedProjectState,
  MenuEventChannel,
} from '../models/electron-api.model';

@Injectable({ providedIn: 'root' })
export class DesktopBridgeService {
  private readonly ngZone = inject(NgZone);
  private readonly api: ElectronAPI | undefined;

  /** Whether the app is running inside Electron (vs. plain browser) */
  readonly isElectron = signal(false);

  /** Current platform — 'darwin', 'win32', 'linux', or 'browser' */
  readonly platform = signal<string>('browser');

  constructor() {
    this.api = window.electronAPI;
    if (this.api) {
      this.isElectron.set(true);
      this.platform.set(this.api.platform);
    } else {
      console.warn(
        '[DesktopBridgeService] electronAPI not available. Running in browser-only mode. ' +
        'File dialogs and FFmpeg features will be unavailable.'
      );
    }
  }

  // =========================================================================
  // File Dialogs
  // =========================================================================

  async openFileDialog(): Promise<FileDialogResult> {
    if (!this.api) {
      return this.browserFallbackFilePicker();
    }
    return this.api.openFileDialog();
  }

  async saveFileDialog(defaultName?: string): Promise<SaveDialogResult> {
    if (!this.api) return { canceled: true, filePath: '' };
    return this.api.saveFileDialog(defaultName);
  }

  async exportFileDialog(): Promise<SaveDialogResult> {
    if (!this.api) return { canceled: true, filePath: '' };
    return this.api.exportFileDialog();
  }

  // =========================================================================
  // Project Persistence
  // =========================================================================

  async saveProject(filePath: string, state: SerializedProjectState): Promise<SaveResult> {
    if (!this.api) return { success: false, error: 'Not running in Electron' };
    return this.api.saveProject(filePath, state);
  }

  async loadProject(filePath: string): Promise<LoadResult> {
    if (!this.api) return { success: false, error: 'Not running in Electron' };
    return this.api.loadProject(filePath);
  }

  // =========================================================================
  // File Operations
  // =========================================================================

  async getVideoMetadata(filePath: string): Promise<VideoMetadata> {
    if (!this.api) throw new Error('Video metadata requires Electron');
    return this.api.getVideoMetadata(filePath);
  }

  async getVideoThumbnail(filePath: string, timeInSeconds: number): Promise<string> {
    if (!this.api) throw new Error('Thumbnails require Electron');
    return this.api.getVideoThumbnail(filePath, timeInSeconds);
  }

  async getFileUrl(filePath: string): Promise<string> {
    if (!this.api) {
      // In browser mode, just return the path (useful for testing with URLs)
      return filePath;
    }
    return this.api.getFileUrl(filePath);
  }

  // =========================================================================
  // Export (FFmpeg Pipeline)
  // =========================================================================

  async exportVideo(config: ExportConfig): Promise<void> {
    if (!this.api) throw new Error('Export requires Electron');
    return this.api.exportVideo(config);
  }

  async cancelExport(): Promise<void> {
    if (!this.api) return;
    return this.api.cancelExport();
  }

  onExportProgress(callback: (progress: ExportProgress) => void): void {
    if (!this.api) return;
    // Wrap callback in NgZone.run so Angular detects the Signal changes
    this.api.onExportProgress((progress) => {
      this.ngZone.run(() => callback(progress));
    });
  }

  removeExportProgressListener(): void {
    if (!this.api) return;
    this.api.removeExportProgressListener();
  }

  // =========================================================================
  // AI Copilot
  // =========================================================================

  async sendAiPrompt(prompt: string, context: AiContext): Promise<AiEditResponse> {
    if (!this.api) {
      return {
        commands: [],
        explanation: 'AI Copilot is not available in browser-only mode.',
      };
    }
    return this.api.sendAiPrompt(prompt, context);
  }

  // =========================================================================
  // Menu Events (Main → Renderer)
  // =========================================================================

  onMenuEvent(channel: MenuEventChannel, callback: (...args: unknown[]) => void): void {
    if (!this.api) return;
    this.api.onMenuEvent(channel, (...args: unknown[]) => {
      this.ngZone.run(() => callback(...args));
    });
  }

  removeMenuListener(channel: MenuEventChannel): void {
    if (!this.api) return;
    this.api.removeMenuListener(channel);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Browser-only fallback file picker using the native <input type="file"> element.
   * Used when running `ng serve` without Electron for development.
   */
  private browserFallbackFilePicker(): Promise<FileDialogResult> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*';

      input.addEventListener('change', () => {
        if (input.files && input.files.length > 0) {
          const filePaths = Array.from(input.files).map((f) =>
            URL.createObjectURL(f)
          );
          resolve({ canceled: false, filePaths });
        } else {
          resolve({ canceled: true, filePaths: [] });
        }
      });

      input.addEventListener('cancel', () => {
        resolve({ canceled: true, filePaths: [] });
      });

      input.click();
    });
  }
}
