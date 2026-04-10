// =============================================================================
// Electron API Type Definitions — IPC Bridge Contract
// =============================================================================
// These interfaces define the strict contract between the Electron Main Process
// (via preload.js contextBridge) and the Angular Renderer Process.
// Both sides must honor this contract for type-safe communication.
// =============================================================================

// ---------------------------------------------------------------------------
// Core API Interface (exposed as window.electronAPI)
// ---------------------------------------------------------------------------
export interface ElectronAPI {
  // File Dialogs
  openFileDialog(): Promise<FileDialogResult>;
  saveFileDialog(defaultName?: string): Promise<SaveDialogResult>;
  exportFileDialog(): Promise<SaveDialogResult>;

  // Project Persistence
  saveProject(filePath: string, state: SerializedProjectState): Promise<SaveResult>;
  loadProject(filePath: string): Promise<LoadResult>;

  // File Operations
  getVideoMetadata(filePath: string): Promise<VideoMetadata>;
  getVideoThumbnail(filePath: string, timeInSeconds: number): Promise<string>;
  getFileUrl(filePath: string): Promise<string>;

  // Export (FFmpeg Pipeline)
  exportVideo(config: ExportConfig): Promise<void>;
  cancelExport(): Promise<void>;
  onExportProgress(callback: (progress: ExportProgress) => void): void;
  removeExportProgressListener(): void;

  // AI Copilot
  sendAiPrompt(prompt: string, context: AiContext): Promise<AiEditResponse>;

  // Menu Events
  onMenuEvent(channel: MenuEventChannel, callback: (...args: unknown[]) => void): void;
  removeMenuListener(channel: MenuEventChannel): void;

  // Platform Info
  platform: 'darwin' | 'win32' | 'linux';
}

// ---------------------------------------------------------------------------
// Menu Event Channels
// ---------------------------------------------------------------------------
export type MenuEventChannel =
  | 'menu:save'
  | 'menu:saveAs'
  | 'menu:export'
  | 'menu:undo'
  | 'menu:redo'
  | 'file:opened'
  | 'project:loaded';

// ---------------------------------------------------------------------------
// File Dialog Results
// ---------------------------------------------------------------------------
export interface FileDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath: string;
}

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface LoadResult {
  success: boolean;
  data?: SerializedProjectState;
  error?: string;
}

// ---------------------------------------------------------------------------
// Video Metadata (from ffprobe)
// ---------------------------------------------------------------------------
export interface VideoMetadata {
  duration: number;       // Total duration in seconds
  width: number;          // Frame width (pixels)
  height: number;         // Frame height (pixels)
  fps: number;            // Frames per second
  codec: string;          // Video codec (e.g., 'h264')
  audioCodec: string;     // Audio codec (e.g., 'aac')
  fileSize: number;       // File size in bytes
  bitrate: number;        // Bitrate in bits/second
}

// ---------------------------------------------------------------------------
// Export Configuration & Progress
// ---------------------------------------------------------------------------
export interface ExportConfig {
  state: SerializedProjectState;
  outputPath: string;
  format: ExportFormat;
  resolution: ExportResolution;
  quality: ExportQuality;
  frameRate: number;
  audioBitrate: string;   // e.g., '192k'
}

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'avi';

export interface ExportResolution {
  width: number;
  height: number;
  label: string;
}

export type ExportQuality = 'low' | 'medium' | 'high' | 'lossless';

export interface ExportProgress {
  percent: number;              // 0–100
  currentTime: number;          // Seconds processed
  totalDuration: number;        // Total seconds to process
  fps: number;                  // Current encoding FPS
  speed: string;                // e.g., '2.5x'
  estimatedTimeRemaining: number; // Seconds remaining
  stage: ExportStage;
}

export type ExportStage = 'preparing' | 'encoding' | 'finalizing' | 'complete' | 'error';

// ---------------------------------------------------------------------------
// AI Copilot Types
// ---------------------------------------------------------------------------
export interface AiContext {
  clips: AiClipContext[];
  tracks: AiTrackContext[];
  totalDuration: number;
  currentTime: number;
}

export interface AiClipContext {
  id: string;
  fileName: string;
  startTime: number;
  inPoint: number;
  outPoint: number;
  duration: number;
  trackId: string;
  filters: AiFilterContext[];
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

export interface AiFilterContext {
  id: string;
  type: string;
  params: Record<string, number | string>;
  enabled: boolean;
}

export interface AiTrackContext {
  id: string;
  name: string;
  type: 'video' | 'audio';
}

export interface AiEditResponse {
  commands: AiEditCommand[];
  explanation: string;
}

export type AiEditCommand =
  | { action: 'trim'; clipId: string; inPoint: number; outPoint: number }
  | { action: 'split'; clipId: string; splitTime: number }
  | { action: 'delete'; clipId: string }
  | { action: 'mute'; clipId: string }
  | { action: 'unmute'; clipId: string }
  | { action: 'setVolume'; clipId: string; volume: number }
  | { action: 'applyFilter'; clipId: string; filterType: string; params: Record<string, number> }
  | { action: 'removeFilter'; clipId: string; filterId: string }
  | { action: 'setPlaybackRate'; clipId: string; rate: number }
  | { action: 'reorder'; clipId: string; newStartTime: number }
  | { action: 'addTrack'; trackType: 'video' | 'audio'; name: string };

// ---------------------------------------------------------------------------
// Serialized Project State (for persistence & IPC transport)
// ---------------------------------------------------------------------------
export interface SerializedProjectState {
  projectId: string;
  projectName: string;
  createdAt: string;
  lastModifiedAt: string;
  clips: SerializedClip[];
  tracks: SerializedTrack[];
  transitions: SerializedTransition[];
  resolution: ExportResolution;
  frameRate: number;
  aspectRatio: string;
}

export interface SerializedClip {
  id: string;
  filePath: string;
  fileName: string;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  trackId: string;
  trackIndex: number;
  filters: SerializedFilter[];
  volume: number;
  isMuted: boolean;
  opacity: number;
  playbackRate: number;
}

export interface SerializedFilter {
  id: string;
  type: string;
  params: Record<string, number | string>;
  enabled: boolean;
}

export interface SerializedTrack {
  id: string;
  name: string;
  type: 'video' | 'audio';
  index: number;
  isLocked: boolean;
  isVisible: boolean;
  isMuted: boolean;
  height: number;
}

export interface SerializedTransition {
  id: string;
  type: string;
  duration: number;
  clipAId: string;
  clipBId: string;
}

// ---------------------------------------------------------------------------
// Global Window Extension (for TypeScript)
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
