// =============================================================================
// Move Clip Command
// =============================================================================

import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

export class MoveClipCommand implements EditCommand {
  readonly type = 'MOVE_CLIP';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly newStartTime: number,
    private readonly newTrackId: string,
    private readonly previousStartTime: number,
    private readonly previousTrackId: string,
  ) {
    this.description = `Move clip to ${newStartTime.toFixed(1)}s`;
  }

  execute(state: ProjectState): ProjectState {
    const targetTrack = state.tracks.find((t) => t.id === this.newTrackId);
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? {
              ...c,
              startTime: this.newStartTime,
              trackId: this.newTrackId,
              trackIndex: targetTrack?.index ?? c.trackIndex,
            }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    const prevTrack = state.tracks.find((t) => t.id === this.previousTrackId);
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? {
              ...c,
              startTime: this.previousStartTime,
              trackId: this.previousTrackId,
              trackIndex: prevTrack?.index ?? c.trackIndex,
            }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
