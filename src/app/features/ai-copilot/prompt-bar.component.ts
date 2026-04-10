import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectStateService } from '../../core/services/project-state.service';
import { DesktopBridgeService } from '../../core/services/desktop-bridge.service';
import { AiCommandExecutorService } from '../../core/services/ai-command-executor.service';
import type { AiEditCommand } from '../../core/models/ai-command.model';

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
  lastResponse = signal('');

  async onSubmit(): Promise<void> {
    const text = this.promptText().trim();
    if (!text || this.isProcessing()) return;

    this.isProcessing.set(true);
    this.lastResponse.set('');

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
        const executed = this.aiExecutor.executeCommands(
          response.commands as AiEditCommand[],
          response.explanation,
        );
        this.lastResponse.set(
          `${response.explanation} (${executed} action${executed !== 1 ? 's' : ''} applied)`,
        );
      } else {
        this.lastResponse.set(response.explanation);
      }
    } catch (err: any) {
      this.lastResponse.set(`Error: ${err?.message ?? 'Unknown error'}`);
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
}
