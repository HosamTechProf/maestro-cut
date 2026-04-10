import { Component, inject } from '@angular/core';
import { ProjectStateService } from '../../core/services/project-state.service';
import { PlaybackService } from '../../core/services/playback.service';
import { DesktopBridgeService } from '../../core/services/desktop-bridge.service';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css',
})
export class ToolbarComponent {
  readonly stateService = inject(ProjectStateService);
  readonly playbackService = inject(PlaybackService);
  readonly bridge = inject(DesktopBridgeService);

  readonly zoom = this.stateService.zoom;
  readonly canUndo = this.stateService.canUndo;
  readonly canRedo = this.stateService.canRedo;
  readonly undoDesc = this.stateService.undoDescription;
  readonly redoDesc = this.stateService.redoDescription;
  readonly snapEnabled = this.stateService.snapEnabled;
  readonly isDirty = this.stateService.isDirty;
  readonly projectName = this.stateService.projectName;

  onUndo(): void { this.stateService.undo(); }
  onRedo(): void { this.stateService.redo(); }

  onSplit(): void { this.stateService.splitAtPlayhead(); }

  onDeleteSelected(): void { this.stateService.removeSelectedClips(); }

  onToggleSnap(): void { this.stateService.toggleSnap(); }

  onZoomChange(event: Event): void {
    const value = +(event.target as HTMLInputElement).value;
    this.stateService.setZoom(value);
  }

  async onOpenFiles(): Promise<void> {
    const result = await this.bridge.openFileDialog();
    if (!result.canceled && result.filePaths.length > 0) {
      // Delegate to parent editor component via state
      // TODO: this should emit to EditorComponent
    }
  }
}
