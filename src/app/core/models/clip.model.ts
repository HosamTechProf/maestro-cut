// =============================================================================
// Clip Model — Core Timeline Data Structures
// =============================================================================
// Defines the immutable data shapes for Clips, Tracks, Transitions, and Filters.
// All properties are readonly to enforce immutability in the Signal-based state.
// Mutations are performed by creating new objects via the Command pattern.
// =============================================================================

// ---------------------------------------------------------------------------
// Filter Types & Interfaces
// ---------------------------------------------------------------------------

/**
 * All supported visual filter types.
 * Each maps to both a CSS filter (for preview) and an FFmpeg filter (for export).
 */
export type FilterType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue-rotate'
  | 'blur'
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'sharpen'
  | 'vignette'
  | 'color-balance'
  | 'temperature'
  | 'fade-in'
  | 'fade-out';

/**
 * Default parameter values and valid ranges for each filter type.
 * Used for validation, UI sliders, and AI command sanitization.
 */
export const FILTER_DEFAULTS: Record<FilterType, FilterParamConfig> = {
  'brightness':     { params: { value: 0 },    ranges: { value: { min: -1, max: 1, step: 0.05 } } },
  'contrast':       { params: { value: 1 },    ranges: { value: { min: 0, max: 3, step: 0.05 } } },
  'saturation':     { params: { value: 1 },    ranges: { value: { min: 0, max: 3, step: 0.05 } } },
  'hue-rotate':     { params: { value: 0 },    ranges: { value: { min: 0, max: 360, step: 1 } } },
  'blur':           { params: { radius: 0 },   ranges: { radius: { min: 0, max: 20, step: 0.5 } } },
  'grayscale':      { params: { amount: 1 },   ranges: { amount: { min: 0, max: 1, step: 0.05 } } },
  'sepia':          { params: { amount: 1 },   ranges: { amount: { min: 0, max: 1, step: 0.05 } } },
  'invert':         { params: { amount: 1 },   ranges: { amount: { min: 0, max: 1, step: 0.05 } } },
  'sharpen':        { params: { amount: 1 },   ranges: { amount: { min: 0, max: 5, step: 0.1 } } },
  'vignette':       { params: { intensity: 0.5 }, ranges: { intensity: { min: 0, max: 1, step: 0.05 } } },
  'color-balance':  { params: { r: 0, g: 0, b: 0 }, ranges: { r: { min: -1, max: 1, step: 0.05 }, g: { min: -1, max: 1, step: 0.05 }, b: { min: -1, max: 1, step: 0.05 } } },
  'temperature':    { params: { value: 0 },    ranges: { value: { min: -1, max: 1, step: 0.05 } } },
  'fade-in':        { params: { duration: 1 }, ranges: { duration: { min: 0.1, max: 5, step: 0.1 } } },
  'fade-out':       { params: { duration: 1 }, ranges: { duration: { min: 0.1, max: 5, step: 0.1 } } },
};

export interface FilterParamConfig {
  readonly params: Record<string, number>;
  readonly ranges: Record<string, FilterParamRange>;
}

export interface FilterParamRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/**
 * A visual filter applied to a clip.
 * Immutable — create new instances for mutations.
 */
export interface ClipFilter {
  readonly id: string;
  readonly type: FilterType;
  readonly params: Readonly<Record<string, number | string>>;
  readonly enabled: boolean;
}

// ---------------------------------------------------------------------------
// Clip Interface
// ---------------------------------------------------------------------------

/**
 * Represents a single media clip on the timeline.
 * All timing values are in seconds.
 */
export interface Clip {
  readonly id: string;

  // --- Source File ---
  readonly filePath: string;         // Absolute path to the media file
  readonly fileName: string;         // Display name (basename)
  readonly fileUrl: string;          // file:// URL for <video> src binding

  // --- Timing (seconds) ---
  readonly startTime: number;        // Position on the timeline (horizontal offset)
  readonly duration: number;         // Original source file duration
  readonly inPoint: number;          // Trim start (relative to source, 0 = beginning)
  readonly outPoint: number;         // Trim end (relative to source, duration = end)

  // --- Track Assignment ---
  readonly trackId: string;          // Which track this clip belongs to
  readonly trackIndex: number;       // Vertical index of the track (for rendering order)

  // --- Effects ---
  readonly filters: readonly ClipFilter[];
  readonly volume: number;           // 0.0 – 1.0
  readonly isMuted: boolean;
  readonly opacity: number;          // 0.0 – 1.0
  readonly playbackRate: number;     // 0.25 – 4.0

  // --- Visual Metadata ---
  readonly thumbnailUrl: string;     // Base64 data URI for timeline thumbnail
  readonly color: string;            // Clip block color for timeline visualization
}

/**
 * Computed effective duration of a clip on the timeline.
 * Accounts for trim (inPoint/outPoint) and playback rate.
 */
export function getClipEffectiveDuration(clip: Clip): number {
  return (clip.outPoint - clip.inPoint) / clip.playbackRate;
}

/**
 * Get the end time of a clip on the timeline.
 */
export function getClipEndTime(clip: Clip): number {
  return clip.startTime + getClipEffectiveDuration(clip);
}

// ---------------------------------------------------------------------------
// Track Interface
// ---------------------------------------------------------------------------

/** Represents a single track lane (row) on the timeline. */
export interface Track {
  readonly id: string;
  readonly name: string;
  readonly type: 'video' | 'audio';
  readonly index: number;            // Vertical order (0 = topmost)
  readonly isLocked: boolean;        // Prevent edits to clips on this track
  readonly isVisible: boolean;       // Toggle visibility in preview
  readonly isMuted: boolean;         // Mute audio for all clips on this track
  readonly height: number;           // Pixel height of the track lane in UI
}

// ---------------------------------------------------------------------------
// Transition Interface
// ---------------------------------------------------------------------------

/** Supported transition types between adjacent clips. */
export type TransitionType = 'crossfade' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'slide' | 'fade-black';

/** Represents a transition between two adjacent clips. */
export interface Transition {
  readonly id: string;
  readonly type: TransitionType;
  readonly duration: number;         // Duration in seconds
  readonly clipAId: string;          // Outgoing clip
  readonly clipBId: string;          // Incoming clip
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

let clipColorIndex = 0;
const CLIP_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

/** Generate a sequential clip color for visual distinction on the timeline. */
export function getNextClipColor(): string {
  const color = CLIP_COLORS[clipColorIndex % CLIP_COLORS.length];
  clipColorIndex++;
  return color;
}

/** Create a new Clip with sensible defaults. */
export function createClip(
  partial: Pick<Clip, 'id' | 'filePath' | 'fileName' | 'fileUrl' | 'duration' | 'trackId' | 'trackIndex'> &
    Partial<Clip>,
): Clip {
  return {
    startTime: 0,
    inPoint: 0,
    outPoint: partial.duration,
    filters: [],
    volume: 1,
    isMuted: false,
    opacity: 1,
    playbackRate: 1,
    thumbnailUrl: '',
    color: getNextClipColor(),
    ...partial,
  };
}

/** Create a new Track with sensible defaults. */
export function createTrack(
  partial: Pick<Track, 'id' | 'name' | 'type' | 'index'> & Partial<Track>,
): Track {
  return {
    isLocked: false,
    isVisible: true,
    isMuted: false,
    height: partial.type === 'video' ? 80 : 60,
    ...partial,
  };
}
