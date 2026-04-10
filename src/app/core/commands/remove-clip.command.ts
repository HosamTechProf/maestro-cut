// =============================================================================
// Remove Clip Command
// =============================================================================

import { Clip } from '../models/clip.model';
import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

export class RemoveClipCommand implements EditCommand {
  readonly type = 'REMOVE_CLIP';
  readonly description: string;
  private removedClip: Clip | null = null;

  constructor(private readonly clipId: string) {
    this.description = `Remove clip`;
  }

  execute(state: ProjectState): ProjectState {
    this.removedClip = state.clips.find((c) => c.id === this.clipId) ?? null;
    if (!this.removedClip) return state; // Clip not found, no-op

    return {
      ...state,
      clips: state.clips.filter((c) => c.id !== this.clipId),
      selectedClipIds: state.selectedClipIds.filter((id) => id !== this.clipId),
      transitions: state.transitions.filter(
        (t) => t.clipAId !== this.clipId && t.clipBId !== this.clipId,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    if (!this.removedClip) return state;

    return {
      ...state,
      clips: [...state.clips, this.removedClip],
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
