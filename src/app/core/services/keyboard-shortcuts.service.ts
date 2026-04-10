// =============================================================================
// Keyboard Shortcuts Service — Global Hotkey Handler
// =============================================================================
// Registers and manages keyboard shortcuts for the entire editor.
// Uses a centralized mapping to avoid scattered event listeners.
// =============================================================================

import { Injectable, inject, OnDestroy } from '@angular/core';
import { ProjectStateService } from './project-state.service';
import { PlaybackService } from './playback.service';

interface ShortcutBinding {
  keys: string;
  action: () => void;
  description: string;
  category: string;
}

@Injectable({ providedIn: 'root' })
export class KeyboardShortcutsService implements OnDestroy {
  private readonly stateService = inject(ProjectStateService);
  private readonly playbackService = inject(PlaybackService);
  private readonly boundHandler: (e: KeyboardEvent) => void;

  private bindings: ShortcutBinding[] = [];

  constructor() {
    this.registerDefaults();
    this.boundHandler = this.handleKeyDown.bind(this);
    document.addEventListener('keydown', this.boundHandler);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.boundHandler);
  }

  /** Get all registered shortcuts (for help dialog). */
  getBindings(): readonly ShortcutBinding[] {
    return this.bindings;
  }

  private registerDefaults(): void {
    this.bindings = [
      // --- Playback ---
      { keys: 'Space', action: () => this.playbackService.togglePlayPause(), description: 'Play / Pause', category: 'Playback' },
      { keys: 'Home', action: () => this.playbackService.jumpToStart(), description: 'Jump to start', category: 'Playback' },
      { keys: 'End', action: () => this.playbackService.jumpToEnd(), description: 'Jump to end', category: 'Playback' },
      { keys: 'ArrowLeft', action: () => this.playbackService.stepFrame(-1), description: 'Previous frame', category: 'Playback' },
      { keys: 'ArrowRight', action: () => this.playbackService.stepFrame(1), description: 'Next frame', category: 'Playback' },
      { keys: 'j', action: () => this.playbackService.seekTo(Math.max(0, this.stateService.currentTime() - 5)), description: 'Skip back 5s', category: 'Playback' },
      { keys: 'l', action: () => this.playbackService.seekTo(this.stateService.currentTime() + 5), description: 'Skip forward 5s', category: 'Playback' },
      { keys: 'k', action: () => this.playbackService.togglePlayPause(), description: 'Toggle play (alt)', category: 'Playback' },

      // --- Editing ---
      { keys: 'Ctrl+z', action: () => this.stateService.undo(), description: 'Undo', category: 'Editing' },
      { keys: 'Ctrl+Shift+z', action: () => this.stateService.redo(), description: 'Redo', category: 'Editing' },
      { keys: 's', action: () => this.stateService.splitAtPlayhead(), description: 'Split at playhead', category: 'Editing' },
      { keys: 'Delete', action: () => this.stateService.removeSelectedClips(), description: 'Delete selected', category: 'Editing' },
      { keys: 'Backspace', action: () => this.stateService.removeSelectedClips(), description: 'Delete selected', category: 'Editing' },

      // --- Selection ---
      { keys: 'Ctrl+a', action: () => this.stateService.selectAll(), description: 'Select all', category: 'Selection' },
      { keys: 'Escape', action: () => this.stateService.deselectAll(), description: 'Deselect all', category: 'Selection' },

      // --- Timeline ---
      { keys: 'n', action: () => this.stateService.toggleSnap(), description: 'Toggle snap', category: 'Timeline' },
      { keys: '=', action: () => this.stateService.setZoom(this.stateService.zoom() * 1.25), description: 'Zoom in', category: 'Timeline' },
      { keys: '-', action: () => this.stateService.setZoom(this.stateService.zoom() / 1.25), description: 'Zoom out', category: 'Timeline' },
      { keys: '0', action: () => this.stateService.setZoom(50), description: 'Reset zoom', category: 'Timeline' },
    ];
  }

  private handleKeyDown(event: KeyboardEvent): void {
    // Don't intercept when typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    // Build the key string
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    parts.push(event.key);
    const keyCombo = parts.join('+');

    // Find matching binding
    const binding = this.bindings.find((b) => {
      const bindParts = b.keys.split('+');
      const eventParts = keyCombo.split('+');
      // Normalize: sort both and compare
      return bindParts.sort().join('+').toLowerCase() === eventParts.sort().join('+').toLowerCase();
    });

    if (binding) {
      event.preventDefault();
      event.stopPropagation();
      binding.action();
    }
  }
}
