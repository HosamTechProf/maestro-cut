// =============================================================================
// Add Clip Command
// =============================================================================

import { Clip } from '../models/clip.model';
import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

export class AddClipCommand implements EditCommand {
  readonly type = 'ADD_CLIP';
  readonly description: string;

  constructor(private readonly clip: Clip) {
    this.description = `Add "${clip.fileName}"`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: [...state.clips, this.clip],
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.filter((c) => c.id !== this.clip.id),
      selectedClipIds: state.selectedClipIds.filter((id) => id !== this.clip.id),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
