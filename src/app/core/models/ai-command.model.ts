// =============================================================================
// AI Command Model — Structured Output from Gemini
// =============================================================================
// These types define the JSON schema that the Gemini model must return.
// Used by both the system prompt (to instruct the model) and the Angular
// service (to parse and validate the response).
// =============================================================================

import { FilterType } from './clip.model';

// ---------------------------------------------------------------------------
// AI Response Shape
// ---------------------------------------------------------------------------

/** The top-level structured response from the Gemini model. */
export interface AiEditResponse {
  readonly commands: readonly AiEditCommand[];
  readonly explanation: string;
}

// ---------------------------------------------------------------------------
// AI Command Discriminated Union
// ---------------------------------------------------------------------------

export type AiEditCommand =
  | AiTrimCommand
  | AiSplitCommand
  | AiDeleteCommand
  | AiMuteCommand
  | AiUnmuteCommand
  | AiSetVolumeCommand
  | AiApplyFilterCommand
  | AiRemoveFilterCommand
  | AiSetPlaybackRateCommand
  | AiReorderCommand
  | AiAddTrackCommand
  | AiSetOpacityCommand;

export interface AiTrimCommand {
  readonly action: 'trim';
  readonly clipId: string;
  readonly inPoint: number;
  readonly outPoint: number;
}

export interface AiSplitCommand {
  readonly action: 'split';
  readonly clipId: string;
  readonly splitTime: number;  // Time relative to clip source
}

export interface AiDeleteCommand {
  readonly action: 'delete';
  readonly clipId: string;
}

export interface AiMuteCommand {
  readonly action: 'mute';
  readonly clipId: string;
}

export interface AiUnmuteCommand {
  readonly action: 'unmute';
  readonly clipId: string;
}

export interface AiSetVolumeCommand {
  readonly action: 'setVolume';
  readonly clipId: string;
  readonly volume: number;     // 0.0 – 1.0
}

export interface AiApplyFilterCommand {
  readonly action: 'applyFilter';
  readonly clipId: string;
  readonly filterType: FilterType;
  readonly params: Record<string, number>;
}

export interface AiRemoveFilterCommand {
  readonly action: 'removeFilter';
  readonly clipId: string;
  readonly filterId: string;
}

export interface AiSetPlaybackRateCommand {
  readonly action: 'setPlaybackRate';
  readonly clipId: string;
  readonly rate: number;       // 0.25 – 4.0
}

export interface AiReorderCommand {
  readonly action: 'reorder';
  readonly clipId: string;
  readonly newStartTime: number;
}

export interface AiAddTrackCommand {
  readonly action: 'addTrack';
  readonly trackType: 'video' | 'audio';
  readonly name: string;
}

export interface AiSetOpacityCommand {
  readonly action: 'setOpacity';
  readonly clipId: string;
  readonly opacity: number;    // 0.0 – 1.0
}

// ---------------------------------------------------------------------------
// Chat History
// ---------------------------------------------------------------------------

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'error';
  readonly content: string;
  readonly timestamp: string;
  readonly commands?: readonly AiEditCommand[];
}

// ---------------------------------------------------------------------------
// AI Context (sent alongside the prompt)
// ---------------------------------------------------------------------------

export interface AiTimelineContext {
  readonly clips: readonly AiClipSnapshot[];
  readonly tracks: readonly AiTrackSnapshot[];
  readonly totalDuration: number;
  readonly currentTime: number;
}

export interface AiClipSnapshot {
  readonly id: string;
  readonly fileName: string;
  readonly startTime: number;
  readonly inPoint: number;
  readonly outPoint: number;
  readonly duration: number;
  readonly trackId: string;
  readonly trackName: string;
  readonly filters: readonly { id: string; type: string; enabled: boolean }[];
  readonly volume: number;
  readonly isMuted: boolean;
  readonly playbackRate: number;
  readonly opacity: number;
}

export interface AiTrackSnapshot {
  readonly id: string;
  readonly name: string;
  readonly type: 'video' | 'audio';
}
