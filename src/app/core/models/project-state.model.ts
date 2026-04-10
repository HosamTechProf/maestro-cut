// =============================================================================
// Project State Model — Central State Shape
// =============================================================================
// The single source of truth for the entire editor's runtime state.
// Every UI component reads from this via Angular Signal slices.
// Every mutation (user or AI) goes through the Command pattern.
// =============================================================================

import { Clip, Track, Transition, createTrack } from './clip.model';

// ---------------------------------------------------------------------------
// Resolution Presets
// ---------------------------------------------------------------------------

export interface Resolution {
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

export const RESOLUTION_PRESETS: readonly Resolution[] = [
  { width: 3840, height: 2160, label: '4K (2160p)' },
  { width: 2560, height: 1440, label: '1440p' },
  { width: 1920, height: 1080, label: '1080p' },
  { width: 1280, height: 720, label: '720p' },
  { width: 854, height: 480, label: '480p' },
  { width: 1080, height: 1920, label: '1080p Vertical' },
  { width: 1080, height: 1080, label: '1080 Square' },
];

// ---------------------------------------------------------------------------
// Project State Interface
// ---------------------------------------------------------------------------

export interface ProjectState {
  // --- Project Metadata ---
  readonly projectId: string;
  readonly projectName: string;
  readonly projectFilePath: string | null;  // Path to .nle.json file (null if unsaved)
  readonly createdAt: string;               // ISO 8601
  readonly lastModifiedAt: string;          // ISO 8601
  readonly isDirty: boolean;                // Has unsaved changes

  // --- Timeline Data ---
  readonly clips: readonly Clip[];
  readonly tracks: readonly Track[];
  readonly transitions: readonly Transition[];

  // --- Playback State ---
  readonly currentTime: number;             // Playhead position (seconds)
  readonly isPlaying: boolean;

  // --- Selection State ---
  readonly selectedClipIds: readonly string[];
  readonly activeTrackId: string | null;

  // --- Timeline UI State ---
  readonly zoom: number;                    // Pixels per second
  readonly scrollOffsetX: number;           // Horizontal scroll position
  readonly scrollOffsetY: number;           // Vertical scroll position
  readonly snapEnabled: boolean;            // Magnetic timeline snap

  // --- Project Settings ---
  readonly resolution: Resolution;
  readonly frameRate: number;               // 24, 25, 30, 50, 60
  readonly aspectRatio: string;             // '16:9', '4:3', '9:16', '1:1'
}

// ---------------------------------------------------------------------------
// Default State
// ---------------------------------------------------------------------------

export const DEFAULT_TRACKS: readonly Track[] = [
  createTrack({ id: 'v1', name: 'Video 1', type: 'video', index: 0 }),
  createTrack({ id: 'v2', name: 'Video 2', type: 'video', index: 1 }),
  createTrack({ id: 'a1', name: 'Audio 1', type: 'audio', index: 2 }),
  createTrack({ id: 'a2', name: 'Audio 2', type: 'audio', index: 3 }),
];

export const DEFAULT_PROJECT_STATE: ProjectState = {
  projectId: '',
  projectName: 'Untitled Project',
  projectFilePath: null,
  createdAt: new Date().toISOString(),
  lastModifiedAt: new Date().toISOString(),
  isDirty: false,

  clips: [],
  tracks: DEFAULT_TRACKS,
  transitions: [],

  currentTime: 0,
  isPlaying: false,

  selectedClipIds: [],
  activeTrackId: null,

  zoom: 50, // 50px per second
  scrollOffsetX: 0,
  scrollOffsetY: 0,
  snapEnabled: true,

  resolution: RESOLUTION_PRESETS[2], // 1080p
  frameRate: 30,
  aspectRatio: '16:9',
};

// ---------------------------------------------------------------------------
// Computed Helpers (Pure Functions)
// ---------------------------------------------------------------------------

import { getClipEndTime } from './clip.model';

/** Compute the total duration of the project from its clips. */
export function computeTotalDuration(clips: readonly Clip[]): number {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map(getClipEndTime));
}

/** Find the active clip at a given time on a specific track (or any track). */
export function findClipAtTime(
  clips: readonly Clip[],
  time: number,
  trackId?: string,
): Clip | null {
  // Prioritize video tracks over audio, and earlier added clips
  const matching = clips
    .filter((c) => {
      if (trackId && c.trackId !== trackId) return false;
      const start = c.startTime;
      const end = getClipEndTime(c);
      return time >= start && time < end;
    })
    .sort((a, b) => a.trackIndex - b.trackIndex); // Topmost track first

  return matching[0] ?? null;
}

/** Find all clips on a given track, sorted by startTime. */
export function getClipsOnTrack(clips: readonly Clip[], trackId: string): Clip[] {
  return clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);
}

/** Check if two clips overlap on the same track. */
export function clipsOverlap(clipA: Clip, clipB: Clip): boolean {
  if (clipA.trackId !== clipB.trackId) return false;
  const aStart = clipA.startTime;
  const aEnd = getClipEndTime(clipA);
  const bStart = clipB.startTime;
  const bEnd = getClipEndTime(clipB);
  return aStart < bEnd && bStart < aEnd;
}

/** Find the next available start time on a track (after all existing clips). */
export function getNextAvailableStartTime(clips: readonly Clip[], trackId: string): number {
  const trackClips = getClipsOnTrack(clips, trackId);
  if (trackClips.length === 0) return 0;
  const lastClip = trackClips[trackClips.length - 1];
  return getClipEndTime(lastClip);
}

/** Generate a unique project ID. */
export function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
