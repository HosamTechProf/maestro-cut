// =============================================================================
// Electron Preload Script — Secure Context Bridge
// =============================================================================
// SECURITY: This script runs in a semi-privileged context between the
// Node.js Main Process and the sandboxed Renderer (Angular).
// It exposes ONLY specific, typed functions to window.electronAPI.
// The raw ipcRenderer is NEVER exposed to the renderer.
// =============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// ---------------------------------------------------------------------------
// Strict API surface — only these functions are callable from Angular
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld('electronAPI', {

  // =========================================================================
  // File Dialogs
  // =========================================================================

  /** Open native file picker for video/audio files */
  openFileDialog: () =>
    ipcRenderer.invoke('dialog:openFile'),

  /** Open native save dialog for project files */
  saveFileDialog: (defaultName) =>
    ipcRenderer.invoke('dialog:saveFile', defaultName),

  /** Open native save dialog for video export */
  exportFileDialog: () =>
    ipcRenderer.invoke('dialog:exportFile'),

  // =========================================================================
  // Project Persistence
  // =========================================================================

  /** Save project state to a .nle.json file */
  saveProject: (filePath, state) =>
    ipcRenderer.invoke('project:save', filePath, state),

  /** Load project state from a .nle.json file */
  loadProject: (filePath) =>
    ipcRenderer.invoke('project:load', filePath),

  // =========================================================================
  // File Operations
  // =========================================================================

  /** Get detailed metadata for a video/audio file via ffprobe */
  getVideoMetadata: (filePath) =>
    ipcRenderer.invoke('file:metadata', filePath),

  /** Generate a thumbnail image at a specific timestamp (returns base64 data URI) */
  getVideoThumbnail: (filePath, timeInSeconds) =>
    ipcRenderer.invoke('file:thumbnail', filePath, timeInSeconds),

  /** Convert a local file path to a file:// URL for use in <video> elements */
  getFileUrl: (filePath) =>
    ipcRenderer.invoke('file:getUrl', filePath),

  // =========================================================================
  // Export (FFmpeg Pipeline)
  // =========================================================================

  /** Start video export — triggers the FFmpeg render pipeline in the main process */
  exportVideo: (config) =>
    ipcRenderer.invoke('export:start', config),

  /** Cancel an in-progress export */
  cancelExport: () =>
    ipcRenderer.invoke('export:cancel'),

  /** Register callback for export progress updates (streamed from main process) */
  onExportProgress: (callback) => {
    // Remove any previously registered listener to prevent leaks
    ipcRenderer.removeAllListeners('export:progress');
    ipcRenderer.on('export:progress', (_event, data) => callback(data));
  },

  /** Remove export progress listener */
  removeExportProgressListener: () => {
    ipcRenderer.removeAllListeners('export:progress');
  },

  // =========================================================================
  // AI Copilot (Gemini API Proxy)
  // =========================================================================

  /** Send a natural-language prompt to the Gemini AI through the main process.
   *  The API key stays in the main process — never exposed to the renderer. */
  sendAiPrompt: (prompt, context) =>
    ipcRenderer.invoke('ai:prompt', prompt, context),

  // =========================================================================
  // Menu Events (Main → Renderer)
  // =========================================================================

  /** Listen for menu-triggered events from the main process */
  onMenuEvent: (channel, callback) => {
    const validChannels = [
      'menu:save',
      'menu:saveAs',
      'menu:export',
      'menu:undo',
      'menu:redo',
      'file:opened',
      'project:loaded',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  /** Remove a menu event listener */
  removeMenuListener: (channel) => {
    const validChannels = [
      'menu:save',
      'menu:saveAs',
      'menu:export',
      'menu:undo',
      'menu:redo',
      'file:opened',
      'project:loaded',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },

  // =========================================================================
  // Platform Info
  // =========================================================================

  /** Get the current platform (darwin, win32, linux) */
  platform: process.platform,
});
