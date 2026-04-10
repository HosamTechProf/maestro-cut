// =============================================================================
// Apply Filter Command
// =============================================================================

import { ClipFilter } from '../models/clip.model';
import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

export class ApplyFilterCommand implements EditCommand {
  readonly type = 'APPLY_FILTER';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly filter: ClipFilter,
  ) {
    this.description = `Apply ${filter.type} filter`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? { ...c, filters: [...c.filters, this.filter] }
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
          ? { ...c, filters: c.filters.filter((f) => f.id !== this.filter.id) }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// =============================================================================
// Remove Filter Command
// =============================================================================

export class RemoveFilterCommand implements EditCommand {
  readonly type = 'REMOVE_FILTER';
  readonly description: string;
  private removedFilter: ClipFilter | null = null;

  constructor(
    private readonly clipId: string,
    private readonly filterId: string,
  ) {
    this.description = `Remove filter`;
  }

  execute(state: ProjectState): ProjectState {
    const clip = state.clips.find((c) => c.id === this.clipId);
    this.removedFilter = clip?.filters.find((f) => f.id === this.filterId) ?? null;

    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? { ...c, filters: c.filters.filter((f) => f.id !== this.filterId) }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    if (!this.removedFilter) return state;
    const filter = this.removedFilter;

    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? { ...c, filters: [...c.filters, filter] }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// =============================================================================
// Update Filter Command
// =============================================================================

export class UpdateFilterCommand implements EditCommand {
  readonly type = 'UPDATE_FILTER';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly filterId: string,
    private readonly newParams: Readonly<Record<string, number | string>>,
    private readonly previousParams: Readonly<Record<string, number | string>>,
  ) {
    this.description = `Update filter parameters`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId
          ? {
              ...c,
              filters: c.filters.map((f) =>
                f.id === this.filterId ? { ...f, params: this.newParams } : f,
              ),
            }
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
          ? {
              ...c,
              filters: c.filters.map((f) =>
                f.id === this.filterId ? { ...f, params: this.previousParams } : f,
              ),
            }
          : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
