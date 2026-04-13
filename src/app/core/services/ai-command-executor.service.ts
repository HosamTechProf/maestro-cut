// =============================================================================
// AI Command Executor — Converts AI JSON Commands → Editor Commands
// =============================================================================
// Takes the structured JSON commands returned by Gemini and converts them
// into concrete EditCommand instances that go through the Command pattern
// for undo/redo support.
// =============================================================================

import { Injectable, inject } from '@angular/core';
import { ProjectStateService } from './project-state.service';
import { EditCommand, BatchCommand } from '../commands/command.interface';
import { TrimClipCommand } from '../commands/trim-clip.command';
import { SplitClipCommand } from '../commands/split-clip.command';
import { RemoveClipCommand } from '../commands/remove-clip.command';
import { MoveClipCommand } from '../commands/move-clip.command';
import { ApplyFilterCommand } from '../commands/apply-filter.command';
import { RemoveFilterCommand } from '../commands/apply-filter.command';
import { SetVolumeCommand, ToggleMuteCommand, SetPlaybackRateCommand, SetOpacityCommand } from '../commands/clip-property.commands';
import { AddTrackCommand } from '../commands/track.commands';
import { createTrack, ClipFilter, FilterType } from '../models/clip.model';
import type { AiEditCommand } from '../models/ai-command.model';

@Injectable({ providedIn: 'root' })
export class AiCommandExecutorService {
  private readonly stateService = inject(ProjectStateService);

  /**
   * Execute a list of AI commands as a single undoable batch.
   * Returns information about the execution, including affected clip IDs.
   */
  executeCommands(aiCommands: readonly AiEditCommand[], explanation: string): { count: number, affectedClipIds: string[] } {
    const editCommands: EditCommand[] = [];
    const affectedClipIds = new Set<string>();

    for (const aiCmd of aiCommands) {
      try {
        const editCmd = this.convertCommand(aiCmd);
        if (editCmd) {
          editCommands.push(editCmd);
          if ('clipId' in aiCmd && aiCmd.clipId) {
            affectedClipIds.add(aiCmd.clipId as string);
          }
        }
      } catch (err) {
        console.warn(`[AiCommandExecutor] Failed to convert command:`, aiCmd, err);
      }
    }

    if (editCommands.length > 0) {
      this.stateService.executeBatch(
        editCommands,
        `AI: ${explanation}`,
      );
    }

    return { 
      count: editCommands.length, 
      affectedClipIds: Array.from(affectedClipIds) 
    };
  }

  /**
   * Convert a single AI command to an EditCommand.
   */
  private convertCommand(aiCmd: AiEditCommand): EditCommand | null {
    switch (aiCmd.action) {
      case 'trim':
        return this.convertTrim(aiCmd);
      case 'split':
        return this.convertSplit(aiCmd);
      case 'delete':
        return this.convertDelete(aiCmd);
      case 'mute':
        return this.convertMute(aiCmd);
      case 'unmute':
        return this.convertUnmute(aiCmd);
      case 'setVolume':
        return this.convertSetVolume(aiCmd);
      case 'applyFilter':
        return this.convertApplyFilter(aiCmd);
      case 'removeFilter':
        return this.convertRemoveFilter(aiCmd);
      case 'setPlaybackRate':
        return this.convertSetPlaybackRate(aiCmd);
      case 'reorder':
        return this.convertReorder(aiCmd);
      case 'setOpacity':
        return this.convertSetOpacity(aiCmd);
      case 'addTrack':
        return this.convertAddTrack(aiCmd);
      default:
        console.warn(`[AiCommandExecutor] Unknown action: ${(aiCmd as any).action}`);
        return null;
    }
  }

  private convertTrim(cmd: Extract<AiEditCommand, { action: 'trim' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new TrimClipCommand(
      cmd.clipId,
      cmd.inPoint,
      cmd.outPoint,
      clip.inPoint,
      clip.outPoint,
    );
  }

  private convertSplit(cmd: Extract<AiEditCommand, { action: 'split' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new SplitClipCommand(cmd.clipId, cmd.splitTime);
  }

  private convertDelete(cmd: Extract<AiEditCommand, { action: 'delete' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new RemoveClipCommand(cmd.clipId);
  }

  private convertMute(cmd: Extract<AiEditCommand, { action: 'mute' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new ToggleMuteCommand(cmd.clipId, true);
  }

  private convertUnmute(cmd: Extract<AiEditCommand, { action: 'unmute' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new ToggleMuteCommand(cmd.clipId, false);
  }

  private convertSetVolume(cmd: Extract<AiEditCommand, { action: 'setVolume' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new SetVolumeCommand(cmd.clipId, cmd.volume, clip.volume);
  }

  private convertApplyFilter(cmd: Extract<AiEditCommand, { action: 'applyFilter' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;

    const filter: ClipFilter = {
      id: `filter_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: cmd.filterType as FilterType,
      params: cmd.params,
      enabled: true,
    };

    return new ApplyFilterCommand(cmd.clipId, filter);
  }

  private convertRemoveFilter(cmd: Extract<AiEditCommand, { action: 'removeFilter' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new RemoveFilterCommand(cmd.clipId, cmd.filterId);
  }

  private convertSetPlaybackRate(cmd: Extract<AiEditCommand, { action: 'setPlaybackRate' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new SetPlaybackRateCommand(cmd.clipId, cmd.rate, clip.playbackRate);
  }

  private convertReorder(cmd: Extract<AiEditCommand, { action: 'reorder' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new MoveClipCommand(cmd.clipId, cmd.newStartTime, clip.trackId, clip.startTime, clip.trackId);
  }

  private convertSetOpacity(cmd: Extract<AiEditCommand, { action: 'setOpacity' }>): EditCommand | null {
    const clip = this.stateService.getClipById(cmd.clipId);
    if (!clip) return null;
    return new SetOpacityCommand(cmd.clipId, cmd.opacity, clip.opacity);
  }

  private convertAddTrack(cmd: Extract<AiEditCommand, { action: 'addTrack' }>): EditCommand {
    const tracks = this.stateService.tracks();
    const index = tracks.length;
    const track = createTrack({
      id: `${cmd.trackType[0]}${Date.now()}`,
      name: cmd.name,
      type: cmd.trackType,
      index,
    });
    return new AddTrackCommand(track);
  }
}
