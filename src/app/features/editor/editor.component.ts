import { Component, inject, viewChild, OnInit, OnDestroy } from '@angular/core';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { VideoPreviewComponent } from '../preview/video-preview.component';
import { TimelineComponent } from '../timeline/timeline.component';
import { PromptBarComponent } from '../ai-copilot/prompt-bar.component';
import { ExportDialogComponent } from '../export/export-dialog.component';
import { PropertiesPanelComponent } from '../properties/properties-panel.component';
import { ProjectStateService } from '../../core/services/project-state.service';
import { DesktopBridgeService } from '../../core/services/desktop-bridge.service';
import { KeyboardShortcutsService } from '../../core/services/keyboard-shortcuts.service';
import { createClip, getNextClipColor } from '../../core/models/clip.model';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    ToolbarComponent,
    VideoPreviewComponent,
    TimelineComponent,
    PromptBarComponent,
    ExportDialogComponent,
    PropertiesPanelComponent,
  ],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.css',
})
export class EditorComponent implements OnInit, OnDestroy {
  readonly stateService = inject(ProjectStateService);
  private readonly bridge = inject(DesktopBridgeService);
  readonly exportDialog = viewChild(ExportDialogComponent);
  // Inject to activate — the service registers keyboard listeners in its constructor
  private readonly _shortcuts = inject(KeyboardShortcutsService);

  ngOnInit(): void {
    // Listen for file open events from the native menu
    this.bridge.onMenuEvent('file:opened', (filePaths: unknown) => {
      if (Array.isArray(filePaths)) {
        this.handleFilesOpened(filePaths as string[]);
      }
    });

    // Listen for project load events from the native menu
    this.bridge.onMenuEvent('project:loaded', (payload: unknown) => {
      const p = payload as { filePath: string; data: any };
      if (p?.data) {
        this.loadProject(p.filePath, p.data);
      }
    });

    // Listen for menu undo/redo
    this.bridge.onMenuEvent('menu:undo', () => this.stateService.undo());
    this.bridge.onMenuEvent('menu:redo', () => this.stateService.redo());

    // Listen for menu save
    this.bridge.onMenuEvent('menu:save', () => this.saveProject());

    // Listen for menu export
    this.bridge.onMenuEvent('menu:export', () => this.exportDialog()?.open());
  }

  ngOnDestroy(): void {
    this.bridge.removeMenuListener('file:opened');
    this.bridge.removeMenuListener('project:loaded');
    this.bridge.removeMenuListener('menu:undo');
    this.bridge.removeMenuListener('menu:redo');
    this.bridge.removeMenuListener('menu:save');
    this.bridge.removeMenuListener('menu:export');
  }

  /**
   * Handle files dropped or opened via dialog.
   * Supports both Electron (real paths) and browser-only mode (blob URLs).
   */
  async handleFilesOpened(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        const isBlobUrl = filePath.startsWith('blob:');

        // --- Get metadata & URL ---
        let metadata = { duration: 60, width: 1920, height: 1080, fps: 30, codec: '', audioCodec: '', fileSize: 0, bitrate: 0 };
        let fileUrl = filePath;
        let fileName = 'imported_video';

        if (isBlobUrl) {
          // Browser-only mode: file is a blob URL from <input type="file">
          fileUrl = filePath; // blob: URL works directly in <video> elements
          fileName = `video_${Date.now()}`;

          // Try to probe duration via a temp <video> element
          try {
            metadata.duration = await this.probeBlobDuration(filePath);
          } catch { /* fallback to 60s */ }
        } else {
          // Electron mode: use ffprobe + custom protocol
          metadata = await this.bridge.getVideoMetadata(filePath);
          fileUrl = await this.bridge.getFileUrl(filePath);
          fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'unknown';
        }

        // Determine which track to place on
        const isAudio = !metadata.width || !metadata.height;
        const trackId = isAudio ? 'a1' : 'v1';
        const track = this.stateService.getTrackById(trackId);

        // Place after existing clips on the track
        const startTime = this.stateService.getNextStartTime(trackId);

        // Get thumbnail (Electron only)
        let thumbnailUrl = '';
        if (!isAudio && !isBlobUrl) {
          try {
            thumbnailUrl = await this.bridge.getVideoThumbnail(filePath, 1);
          } catch { /* ignore thumbnail errors */ }
        }

        this.stateService.addClip({
          id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          filePath: isBlobUrl ? '' : filePath,
          fileName,
          fileUrl,
          duration: metadata.duration,
          trackId,
          trackIndex: track?.index ?? 0,
          startTime,
          thumbnailUrl,
        });
      } catch (err) {
        console.error('Failed to import file:', filePath, err);
      }
    }
  }

  /**
   * Open files via the native dialog.
   */
  async openFiles(): Promise<void> {
    const result = await this.bridge.openFileDialog();
    if (!result.canceled && result.filePaths.length > 0) {
      await this.handleFilesOpened(result.filePaths);
    }
  }

  /**
   * Save the project.
   */
  async saveProject(): Promise<void> {
    let filePath = this.stateService.projectFilePath();

    if (!filePath) {
      const result = await this.bridge.saveFileDialog(
        `${this.stateService.projectName()}.nle.json`
      );
      if (result.canceled || !result.filePath) return;
      filePath = result.filePath;
    }

    const state = this.stateService.serialize();
    const result = await this.bridge.saveProject(filePath, state);

    if (result.success) {
      this.stateService.setProjectFilePath(filePath);
      this.stateService.markClean();
    }
  }

  /**
   * Probe video duration from a blob URL using a temporary <video> element.
   * Used in browser-only mode where ffprobe is not available.
   */
  private probeBlobDuration(blobUrl: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = blobUrl;
      video.onloadedmetadata = () => {
        resolve(video.duration);
        video.src = '';
      };
      video.onerror = () => reject(new Error('Cannot load video metadata'));
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Metadata load timeout')), 5000);
    });
  }

  /**
   * Load a saved project file.
   * Deserializes the state and resolves fileUrl for each clip.
   */
  private async loadProject(filePath: string, data: any): Promise<void> {
    // Deserialize the project state
    this.stateService.deserialize(data);
    this.stateService.setProjectFilePath(filePath);

    // Resolve fileUrl for each clip (convert local file paths → nle-media:// URLs)
    const clips = this.stateService.clips();
    for (const clip of clips) {
      if (clip.filePath && !clip.fileUrl) {
        try {
          const fileUrl = await this.bridge.getFileUrl(clip.filePath);
          this.stateService.updateClipFileUrl(clip.id, fileUrl);
        } catch (err) {
          console.error(`Failed to resolve URL for clip ${clip.id}:`, err);
        }
      }
    }
  }
}
