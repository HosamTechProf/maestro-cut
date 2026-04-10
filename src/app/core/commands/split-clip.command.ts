// =============================================================================
// Split Clip Command
// =============================================================================

import { Clip, getClipEffectiveDuration } from '../models/clip.model';
import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

/**
 * Splits a clip at a given time (relative to the clip source).
 * Creates two clips from one — the original is trimmed and a second clip
 * is created with the remaining portion.
 */
export class SplitClipCommand implements EditCommand {
  readonly type = 'SPLIT_CLIP';
  readonly description: string;
  private newClipId: string;

  constructor(
    private readonly clipId: string,
    private readonly splitTime: number,  // Relative to source (between inPoint and outPoint)
  ) {
    this.description = `Split clip at ${splitTime.toFixed(1)}s`;
    this.newClipId = `${clipId}_split_${Date.now()}`;
  }

  execute(state: ProjectState): ProjectState {
    const originalClip = state.clips.find((c) => c.id === this.clipId);
    if (!originalClip) return state;

    // Validate split time is within bounds
    if (this.splitTime <= originalClip.inPoint || this.splitTime >= originalClip.outPoint) {
      return state; // Invalid split point
    }

    // First half: same clip but outPoint set to splitTime
    const firstHalf: Clip = {
      ...originalClip,
      outPoint: this.splitTime,
    };

    // Second half: new clip starting where the first half ends
    const timeBeforeSplit = (this.splitTime - originalClip.inPoint) / originalClip.playbackRate;
    const secondHalf: Clip = {
      ...originalClip,
      id: this.newClipId,
      startTime: originalClip.startTime + timeBeforeSplit,
      inPoint: this.splitTime,
      // outPoint stays the same
    };

    return {
      ...state,
      clips: state.clips.map((c) => (c.id === this.clipId ? firstHalf : c)).concat(secondHalf),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    // Find both halves
    const firstHalf = state.clips.find((c) => c.id === this.clipId);
    const secondHalf = state.clips.find((c) => c.id === this.newClipId);

    if (!firstHalf || !secondHalf) return state;

    // Restore original clip by extending outPoint back
    const restoredClip: Clip = {
      ...firstHalf,
      outPoint: secondHalf.outPoint,
    };

    return {
      ...state,
      clips: state.clips
        .filter((c) => c.id !== this.newClipId)
        .map((c) => (c.id === this.clipId ? restoredClip : c)),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
