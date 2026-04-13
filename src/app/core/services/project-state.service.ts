// =============================================================================
// Project State Service — Centralized Signal Store
// =============================================================================
// THE single source of truth for the entire editor's state.
// All components read from computed signal slices.
// All mutations go through Commands (for undo/redo tracking).
// Direct mutations (setCurrentTime, setPlaying) are for transient state only.
// =============================================================================

import { Injectable, signal, computed, inject } from '@angular/core';
import {
  ProjectState,
  DEFAULT_PROJECT_STATE,
  computeTotalDuration,
  findClipAtTime,
  getClipsOnTrack,
  getNextAvailableStartTime,
  generateProjectId,
} from '../models/project-state.model';
import { Clip, Track, Transition, ClipFilter, createClip, createTrack, getClipEndTime } from '../models/clip.model';
import { CommandManagerService } from './command-manager.service';
import { EditCommand, BatchCommand } from '../commands/command.interface';
import { AddClipCommand } from '../commands/add-clip.command';
import { RemoveClipCommand } from '../commands/remove-clip.command';
import { TrimClipCommand } from '../commands/trim-clip.command';
import { MoveClipCommand } from '../commands/move-clip.command';
import { SplitClipCommand } from '../commands/split-clip.command';
import { ApplyFilterCommand, RemoveFilterCommand, UpdateFilterCommand } from '../commands/apply-filter.command';
import { SetVolumeCommand, ToggleMuteCommand, SetOpacityCommand, SetPlaybackRateCommand } from '../commands/clip-property.commands';
import { AddTrackCommand, RemoveTrackCommand, ToggleTrackMuteCommand, ToggleTrackLockCommand, ToggleTrackVisibilityCommand } from '../commands/track.commands';
import type { SerializedProjectState } from '../models/electron-api.model';

@Injectable({ providedIn: 'root' })
export class ProjectStateService {
  private readonly commandManager = inject(CommandManagerService);

  // =========================================================================
  // Primary State Signal
  // =========================================================================

  private readonly _state = signal<ProjectState>({
    ...DEFAULT_PROJECT_STATE,
    projectId: generateProjectId(),
  });

  // =========================================================================
  // Public Readonly Signal Slices
  // =========================================================================

  /** The entire project state (readonly). */
  readonly state = this._state.asReadonly();

  /** All clips on the timeline. */
  readonly clips = computed(() => this._state().clips);

  /** All tracks. */
  readonly tracks = computed(() => this._state().tracks);

  /** All transitions. */
  readonly transitions = computed(() => this._state().transitions);

  /** Current playhead position (seconds). */
  readonly currentTime = computed(() => this._state().currentTime);

  /** Whether playback is active. */
  readonly isPlaying = computed(() => this._state().isPlaying);

  /** Currently selected clip IDs. */
  readonly selectedClipIds = computed(() => this._state().selectedClipIds);

  /** Currently selected clip objects. */
  readonly selectedClips = computed(() =>
    this._state().clips.filter((c) => this._state().selectedClipIds.includes(c.id)),
  );

  /** The first selected clip (for properties panel). */
  readonly primarySelectedClip = computed(() => {
    const ids = this._state().selectedClipIds;
    return ids.length > 0
      ? this._state().clips.find((c) => c.id === ids[0]) ?? null
      : null;
  });

  /** Active track ID. */
  readonly activeTrackId = computed(() => this._state().activeTrackId);

  /** Total duration of the project (computed from clips). */
  readonly totalDuration = computed(() => computeTotalDuration(this._state().clips));

  /** The video clip at the current playhead position (topmost video track). */
  readonly activeClipAtPlayhead = computed(() =>
    findClipAtTime(this._state().clips, this._state().currentTime),
  );

  /** Timeline zoom (px/sec). */
  readonly zoom = computed(() => this._state().zoom);

  /** Timeline scroll positions. */
  readonly scrollOffsetX = computed(() => this._state().scrollOffsetX);
  readonly scrollOffsetY = computed(() => this._state().scrollOffsetY);

  /** Snap enabled. */
  readonly snapEnabled = computed(() => this._state().snapEnabled);

  /** Project metadata. */
  readonly projectName = computed(() => this._state().projectName);
  readonly projectFilePath = computed(() => this._state().projectFilePath);
  readonly isDirty = computed(() => this._state().isDirty);
  readonly resolution = computed(() => this._state().resolution);
  readonly frameRate = computed(() => this._state().frameRate);

  /** Undo/redo delegated signals. */
  readonly canUndo = this.commandManager.canUndo;
  readonly canRedo = this.commandManager.canRedo;
  readonly undoDescription = this.commandManager.undoDescription;
  readonly redoDescription = this.commandManager.redoDescription;

  // =========================================================================
  // Command Execution (Undoable Mutations)
  // =========================================================================

  /** Execute any EditCommand through the command manager. */
  executeCommand(command: EditCommand): void {
    const newState = this.commandManager.execute(command, this._state());
    this._state.set(newState);
  }

  /** Execute multiple commands as a single undoable batch. */
  executeBatch(commands: EditCommand[], description?: string): void {
    if (commands.length === 0) return;
    if (commands.length === 1) {
      this.executeCommand(commands[0]);
      return;
    }
    this.executeCommand(new BatchCommand(commands, description));
  }

  /** Undo the last operation. */
  undo(): void {
    const newState = this.commandManager.undo(this._state());
    if (newState) this._state.set(newState);
  }

  /** Redo the last undone operation. */
  redo(): void {
    const newState = this.commandManager.redo(this._state());
    if (newState) this._state.set(newState);
  }

  // =========================================================================
  // Convenience Mutators (wrap Command creation + execution)
  // =========================================================================

  /** Add a clip to the timeline. */
  addClip(clipData: Parameters<typeof createClip>[0]): Clip {
    const clip = createClip(clipData);
    this.executeCommand(new AddClipCommand(clip));
    return clip;
  }

  /** Remove a clip by ID. */
  removeClip(clipId: string): void {
    this.executeCommand(new RemoveClipCommand(clipId));
  }

  /** Remove all selected clips. */
  removeSelectedClips(): void {
    const ids = this._state().selectedClipIds;
    if (ids.length === 0) return;
    const commands = ids.map((id) => new RemoveClipCommand(id));
    this.executeBatch(commands, `Delete ${ids.length} clip(s)`);
  }

  /** Trim a clip's in/out points. */
  trimClip(clipId: string, inPoint: number, outPoint: number): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.executeCommand(
      new TrimClipCommand(clipId, inPoint, outPoint, clip.inPoint, clip.outPoint),
    );
  }

  /** Move a clip to a new position and/or track. */
  moveClip(clipId: string, newStartTime: number, newTrackId?: string): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.executeCommand(
      new MoveClipCommand(
        clipId,
        newStartTime,
        newTrackId ?? clip.trackId,
        clip.startTime,
        clip.trackId,
      ),
    );
  }

  /** Split a clip at the current playhead position. */
  splitClipAtPlayhead(clipId: string): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;

    // Convert timeline time to source time
    const sourceTime = this._state().currentTime - clip.startTime + clip.inPoint;
    this.executeCommand(new SplitClipCommand(clipId, sourceTime));
  }

  /** Split the active clip at the playhead. */
  splitAtPlayhead(): void {
    const clip = this.activeClipAtPlayhead();
    if (clip) this.splitClipAtPlayhead(clip.id);
  }

  /** Apply a filter to a clip. */
  applyFilter(clipId: string, filter: ClipFilter): void {
    this.executeCommand(new ApplyFilterCommand(clipId, filter));
  }

  /** Remove a filter from a clip. */
  removeFilter(clipId: string, filterId: string): void {
    this.executeCommand(new RemoveFilterCommand(clipId, filterId));
  }

  /** Update filter parameters. */
  updateFilter(clipId: string, filterId: string, newParams: Record<string, number | string>): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    const filter = clip?.filters.find((f) => f.id === filterId);
    if (!clip || !filter) return;
    this.executeCommand(
      new UpdateFilterCommand(clipId, filterId, newParams, filter.params),
    );
  }

  /** Set clip volume. */
  setVolume(clipId: string, volume: number): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.executeCommand(new SetVolumeCommand(clipId, volume, clip.volume));
  }

  /** Toggle clip mute. */
  toggleMute(clipId: string): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.executeCommand(new ToggleMuteCommand(clipId, !clip.isMuted));
  }

  /** Set clip opacity. */
  setOpacity(clipId: string, opacity: number): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.executeCommand(new SetOpacityCommand(clipId, opacity, clip.opacity));
  }

  /** Set clip playback rate. */
  setPlaybackRate(clipId: string, rate: number): void {
    const clip = this._state().clips.find((c) => c.id === clipId);
    if (!clip) return;
    this.executeCommand(new SetPlaybackRateCommand(clipId, rate, clip.playbackRate));
  }

  /** Add a new track. */
  addTrack(type: 'video' | 'audio', name?: string): Track {
    const existingTracks = this._state().tracks.filter((t) => t.type === type);
    const index = this._state().tracks.length;
    const trackName = name ?? `${type === 'video' ? 'Video' : 'Audio'} ${existingTracks.length + 1}`;
    const track = createTrack({
      id: `${type[0]}${Date.now()}`,
      name: trackName,
      type,
      index,
    });
    this.executeCommand(new AddTrackCommand(track));
    return track;
  }

  /** Toggle track mute. */
  toggleTrackMute(trackId: string): void {
    const track = this._state().tracks.find((t) => t.id === trackId);
    if (!track) return;
    this.executeCommand(new ToggleTrackMuteCommand(trackId, !track.isMuted));
  }

  /** Toggle track lock. */
  toggleTrackLock(trackId: string): void {
    const track = this._state().tracks.find((t) => t.id === trackId);
    if (!track) return;
    this.executeCommand(new ToggleTrackLockCommand(trackId, !track.isLocked));
  }

  /** Toggle track visibility. */
  toggleTrackVisibility(trackId: string): void {
    const track = this._state().tracks.find((t) => t.id === trackId);
    if (!track) return;
    this.executeCommand(new ToggleTrackVisibilityCommand(trackId, !track.isVisible));
  }

  // =========================================================================
  // Direct Mutations (Non-undoable, for transient UI state)
  // =========================================================================

  /** Set the playhead position (not undoable — this is continuous). */
  setCurrentTime(time: number): void {
    this._state.update((s) => ({ ...s, currentTime: Math.max(0, time) }));
  }

  /** Set playing state. */
  setPlaying(isPlaying: boolean): void {
    this._state.update((s) => ({ ...s, isPlaying }));
  }

  /** Set timeline zoom level. */
  setZoom(zoom: number): void {
    this._state.update((s) => ({ ...s, zoom: Math.max(1, Math.min(600, zoom)) }));
  }

  /** Set timeline scroll offsets. */
  setScrollOffset(x: number, y?: number): void {
    this._state.update((s) => ({
      ...s,
      scrollOffsetX: x,
      scrollOffsetY: y ?? s.scrollOffsetY,
    }));
  }

  /** Toggle snap. */
  toggleSnap(): void {
    this._state.update((s) => ({ ...s, snapEnabled: !s.snapEnabled }));
  }

  /** Select clip(s). */
  selectClips(clipIds: string[], addToSelection = false): void {
    this._state.update((s) => ({
      ...s,
      selectedClipIds: addToSelection
        ? [...new Set([...s.selectedClipIds, ...clipIds])]
        : clipIds,
    }));
  }

  /** Deselect all clips. */
  deselectAll(): void {
    this._state.update((s) => ({ ...s, selectedClipIds: [] }));
  }

  /** Select all clips. */
  selectAll(): void {
    this._state.update((s) => ({
      ...s,
      selectedClipIds: s.clips.map((c) => c.id),
    }));
  }

  /** Set active track. */
  setActiveTrack(trackId: string | null): void {
    this._state.update((s) => ({ ...s, activeTrackId: trackId }));
  }

  /** Set project name. */
  setProjectName(name: string): void {
    this._state.update((s) => ({
      ...s,
      projectName: name,
      isDirty: true,
      lastModifiedAt: new Date().toISOString(),
    }));
  }

  /** Set project file path (after save). */
  setProjectFilePath(filePath: string): void {
    this._state.update((s) => ({ ...s, projectFilePath: filePath }));
  }

  /** Mark state as clean (after save). */
  markClean(): void {
    this._state.update((s) => ({ ...s, isDirty: false }));
  }

  /** Update a clip's fileUrl (used after loading a project to resolve nle-media:// URLs). */
  updateClipFileUrl(clipId: string, fileUrl: string): void {
    this._state.update((s) => ({
      ...s,
      clips: s.clips.map((c) =>
        c.id === clipId ? { ...c, fileUrl } : c
      ),
    }));
  }

  // =========================================================================
  // Serialization
  // =========================================================================

  /** Serialize the state for saving to .nle.json or IPC transport. */
  serialize(): SerializedProjectState {
    const s = this._state();
    return {
      projectId: s.projectId,
      projectName: s.projectName,
      createdAt: s.createdAt,
      lastModifiedAt: s.lastModifiedAt,
      clips: s.clips.map((c) => ({
        id: c.id,
        filePath: c.filePath,
        fileName: c.fileName,
        startTime: c.startTime,
        duration: c.duration,
        inPoint: c.inPoint,
        outPoint: c.outPoint,
        trackId: c.trackId,
        trackIndex: c.trackIndex,
        filters: c.filters.map((f) => ({
          id: f.id,
          type: f.type,
          params: { ...f.params },
          enabled: f.enabled,
        })),
        volume: c.volume,
        isMuted: c.isMuted,
        opacity: c.opacity,
        playbackRate: c.playbackRate,
      })),
      tracks: s.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        index: t.index,
        isLocked: t.isLocked,
        isVisible: t.isVisible,
        isMuted: t.isMuted,
        height: t.height,
      })),
      transitions: s.transitions.map((t) => ({
        id: t.id,
        type: t.type,
        duration: t.duration,
        clipAId: t.clipAId,
        clipBId: t.clipBId,
      })),
      resolution: { ...s.resolution },
      frameRate: s.frameRate,
      aspectRatio: s.aspectRatio,
    };
  }

  /** Deserialize and load a saved project state. */
  deserialize(data: SerializedProjectState): void {
    this.commandManager.clear();
    this._state.set({
      ...DEFAULT_PROJECT_STATE,
      projectId: data.projectId,
      projectName: data.projectName,
      createdAt: data.createdAt,
      lastModifiedAt: data.lastModifiedAt,
      isDirty: false,
      clips: data.clips.map((c) => ({
        ...c,
        filters: c.filters.map((f) => ({
          ...f,
          type: f.type as ClipFilter['type'],
        })),
        fileUrl: '', // Will be resolved by the component after load
        thumbnailUrl: '',
        color: '',
      })),
      tracks: data.tracks,
      transitions: data.transitions.map((t) => ({
        ...t,
        type: t.type as Transition['type'],
      })),
      resolution: data.resolution,
      frameRate: data.frameRate,
      aspectRatio: data.aspectRatio,
    });
  }

  /** Reset to a brand-new project. */
  newProject(): void {
    this.commandManager.clear();
    this._state.set({
      ...DEFAULT_PROJECT_STATE,
      projectId: generateProjectId(),
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    });
  }

  // =========================================================================
  // Utility Helpers
  // =========================================================================

  /** Get the next available start time on a given track. */
  getNextStartTime(trackId: string): number {
    return getNextAvailableStartTime(this._state().clips, trackId);
  }

  /** Get clips on a specific track, sorted by startTime. */
  getClipsOnTrack(trackId: string): Clip[] {
    return getClipsOnTrack(this._state().clips, trackId);
  }

  /** Find a clip by ID. */
  getClipById(clipId: string): Clip | undefined {
    return this._state().clips.find((c) => c.id === clipId);
  }

  /** Find a track by ID. */
  getTrackById(trackId: string): Track | undefined {
    return this._state().tracks.find((t) => t.id === trackId);
  }
}
