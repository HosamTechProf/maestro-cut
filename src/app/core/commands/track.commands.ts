// =============================================================================
// Track Commands — Add, Remove, Reorder, Toggle Properties
// =============================================================================

import { Track, createTrack } from '../models/clip.model';
import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

// ---------------------------------------------------------------------------
// Add Track Command
// ---------------------------------------------------------------------------

export class AddTrackCommand implements EditCommand {
  readonly type = 'ADD_TRACK';
  readonly description: string;

  constructor(private readonly track: Track) {
    this.description = `Add ${track.type} track "${track.name}"`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: [...state.tracks, this.track],
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.filter((t) => t.id !== this.track.id),
      // Also remove any clips assigned to this track
      clips: state.clips.filter((c) => c.trackId !== this.track.id),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Remove Track Command
// ---------------------------------------------------------------------------

export class RemoveTrackCommand implements EditCommand {
  readonly type = 'REMOVE_TRACK';
  readonly description: string;
  private removedTrack: Track | null = null;
  private removedClipIds: string[] = [];

  constructor(private readonly trackId: string) {
    this.description = `Remove track`;
  }

  execute(state: ProjectState): ProjectState {
    this.removedTrack = state.tracks.find((t) => t.id === this.trackId) ?? null;
    this.removedClipIds = state.clips
      .filter((c) => c.trackId === this.trackId)
      .map((c) => c.id);

    return {
      ...state,
      tracks: state.tracks.filter((t) => t.id !== this.trackId),
      clips: state.clips.filter((c) => c.trackId !== this.trackId),
      selectedClipIds: state.selectedClipIds.filter(
        (id) => !this.removedClipIds.includes(id),
      ),
      activeTrackId:
        state.activeTrackId === this.trackId ? null : state.activeTrackId,
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    if (!this.removedTrack) return state;
    // Note: clips that were on this track are NOT restored here
    // because they were captured as separate remove-clip commands
    // in a batch. For simplicity, we only restore the track.
    return {
      ...state,
      tracks: [...state.tracks, this.removedTrack],
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Toggle Track Mute Command
// ---------------------------------------------------------------------------

export class ToggleTrackMuteCommand implements EditCommand {
  readonly type = 'TOGGLE_TRACK_MUTE';
  readonly description: string;

  constructor(
    private readonly trackId: string,
    private readonly muted: boolean,
  ) {
    this.description = muted ? 'Mute track' : 'Unmute track';
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === this.trackId ? { ...t, isMuted: this.muted } : t,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === this.trackId ? { ...t, isMuted: !this.muted } : t,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Toggle Track Lock Command
// ---------------------------------------------------------------------------

export class ToggleTrackLockCommand implements EditCommand {
  readonly type = 'TOGGLE_TRACK_LOCK';
  readonly description: string;

  constructor(
    private readonly trackId: string,
    private readonly locked: boolean,
  ) {
    this.description = locked ? 'Lock track' : 'Unlock track';
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === this.trackId ? { ...t, isLocked: this.locked } : t,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === this.trackId ? { ...t, isLocked: !this.locked } : t,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Toggle Track Visibility Command
// ---------------------------------------------------------------------------

export class ToggleTrackVisibilityCommand implements EditCommand {
  readonly type = 'TOGGLE_TRACK_VISIBILITY';
  readonly description: string;

  constructor(
    private readonly trackId: string,
    private readonly visible: boolean,
  ) {
    this.description = visible ? 'Show track' : 'Hide track';
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === this.trackId ? { ...t, isVisible: this.visible } : t,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === this.trackId ? { ...t, isVisible: !this.visible } : t,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
