// =============================================================================
// Clip Property Commands — Volume, Mute, Opacity, Playback Rate
// =============================================================================

import { ProjectState } from '../models/project-state.model';
import { EditCommand } from './command.interface';

// ---------------------------------------------------------------------------
// Set Volume Command
// ---------------------------------------------------------------------------

export class SetVolumeCommand implements EditCommand {
  readonly type = 'SET_VOLUME';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly newVolume: number,
    private readonly previousVolume: number,
  ) {
    this.description = `Set volume to ${Math.round(newVolume * 100)}%`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, volume: this.newVolume } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, volume: this.previousVolume } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Toggle Mute Command
// ---------------------------------------------------------------------------

export class ToggleMuteCommand implements EditCommand {
  readonly type = 'TOGGLE_MUTE';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly muted: boolean,
  ) {
    this.description = muted ? 'Mute clip' : 'Unmute clip';
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, isMuted: this.muted } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, isMuted: !this.muted } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Set Opacity Command
// ---------------------------------------------------------------------------

export class SetOpacityCommand implements EditCommand {
  readonly type = 'SET_OPACITY';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly newOpacity: number,
    private readonly previousOpacity: number,
  ) {
    this.description = `Set opacity to ${Math.round(newOpacity * 100)}%`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, opacity: this.newOpacity } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, opacity: this.previousOpacity } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Set Playback Rate Command
// ---------------------------------------------------------------------------

export class SetPlaybackRateCommand implements EditCommand {
  readonly type = 'SET_PLAYBACK_RATE';
  readonly description: string;

  constructor(
    private readonly clipId: string,
    private readonly newRate: number,
    private readonly previousRate: number,
  ) {
    this.description = `Set speed to ${newRate}x`;
  }

  execute(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, playbackRate: this.newRate } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }

  undo(state: ProjectState): ProjectState {
    return {
      ...state,
      clips: state.clips.map((c) =>
        c.id === this.clipId ? { ...c, playbackRate: this.previousRate } : c,
      ),
      lastModifiedAt: new Date().toISOString(),
      isDirty: true,
    };
  }
}
