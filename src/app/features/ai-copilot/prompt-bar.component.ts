import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectStateService } from '../../core/services/project-state.service';
import { DesktopBridgeService } from '../../core/services/desktop-bridge.service';
import { AiCommandExecutorService } from '../../core/services/ai-command-executor.service';
import type { AiEditCommand } from '../../core/models/ai-command.model';

interface AiResponseDisplay {
  explanation: string;
  actionCount: number;
  actions: string[];
  isError: boolean;
}

@Component({
  selector: 'app-prompt-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './prompt-bar.component.html',
  styleUrl: './prompt-bar.component.css',
})
export class PromptBarComponent {
  readonly stateService = inject(ProjectStateService);
  private readonly bridge = inject(DesktopBridgeService);
  private readonly aiExecutor = inject(AiCommandExecutorService);

  promptText = signal('');
  isProcessing = signal(false);
  lastResponse = signal<AiResponseDisplay | null>(null);

  async onSubmit(): Promise<void> {
    const text = this.promptText().trim();
    if (!text || this.isProcessing()) return;

    this.isProcessing.set(true);
    this.lastResponse.set(null);

    try {
      // Build context from current state
      const state = this.stateService.state();
      const context = {
        clips: state.clips.map((c) => ({
          id: c.id,
          fileName: c.fileName,
          startTime: c.startTime,
          inPoint: c.inPoint,
          outPoint: c.outPoint,
          duration: c.duration,
          trackId: c.trackId,
          trackName: this.stateService.getTrackById(c.trackId)?.name ?? '',
          filters: c.filters.map((f) => ({ id: f.id, type: f.type, params: f.params as Record<string, number | string>, enabled: f.enabled })),
          volume: c.volume,
          isMuted: c.isMuted,
          playbackRate: c.playbackRate,
          opacity: c.opacity,
        })),
        tracks: state.tracks.map((t) => ({ id: t.id, name: t.name, type: t.type })),
        totalDuration: this.stateService.totalDuration(),
        currentTime: state.currentTime,
      };

      const response = await this.bridge.sendAiPrompt(text, context);

      // Execute the AI commands on the timeline
      if (response.commands && response.commands.length > 0) {
        const { count, affectedClipIds } = this.aiExecutor.executeCommands(
          response.commands as AiEditCommand[],
          response.explanation,
        );
        
        // Highlight the affected clips purely for interaction!
        if (affectedClipIds.length > 0) {
          this.stateService.deselectAll();
          this.stateService.selectClips(affectedClipIds);
        }

        this.lastResponse.set({
          explanation: response.explanation,
          actionCount: count,
          actions: response.commands.map((c: any) => c.action),
          isError: false
        });
      } else {
        const isErrorMsg = response.explanation.toLowerCase().includes('error') || 
                           response.explanation.toLowerCase().includes('demand') ||
                           response.explanation.toLowerCase().includes('failed');
                           
        this.lastResponse.set({
          explanation: response.explanation,
          actionCount: 0,
          actions: [],
          isError: isErrorMsg
        });
      }
    } catch (err: any) {
      this.lastResponse.set({
        explanation: err?.message ?? 'Unknown error',
        actionCount: 0,
        actions: [],
        isError: true
      });
    } finally {
      this.isProcessing.set(false);
      this.promptText.set('');
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSubmit();
    }
  }

  closeResponse(): void {
    this.lastResponse.set(null);
  }
}
