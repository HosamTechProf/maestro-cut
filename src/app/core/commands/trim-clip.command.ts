// =============================================================================
// Trim Clip Command
// =============================================================================

import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

export class TrimClipCommand implements EditCommand {
  readonly type = 'TRIM_CLIP';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly newInPoint: number,
    private readonly newOutPoint: number,
    private readonly previousInPoint: number,
    private readonly previousOutPoint: number,
  ) {
    this.description = `Trim clip to ${newInPoint.toFixed(1)}s – ${newOutPoint.toFixed(1)}s`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? { ...c, inPoint: this.newInPoint, outPoint: this.newOutPoint }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? { ...c, inPoint: this.previousInPoint, outPoint: this.previousOutPoint }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
