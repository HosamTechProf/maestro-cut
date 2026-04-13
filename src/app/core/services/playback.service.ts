// =============================================================================
// Playback Service — State Manager
// =============================================================================
// Manages play/pause/seek state. Does NOT own the rAF loop.
// The VideoPreviewComponent owns the animation loop and video element.
// =============================================================================

import { Injectable, inject, signal } from '@angular/core';
import { ProjectStateService } from './project-state.service';

@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly stateService = inject(ProjectStateService);

  /** Current playback FPS for display (set by the preview component). */
  readonly currentFps = signal(0);

  /** Whether to loop playback at end of timeline. */
  readonly loopEnabled = signal(true);

  /**
   * Start playback.
   */
  play(): void {
    const totalDuration = this.stateService.totalDuration();
    if (totalDuration <= 0) return;

    // Only restart from beginning if truly AT the very end
    const currentTime = this.stateService.currentTime();
    if (currentTime >= totalDuration - 0.01) {
      this.stateService.setCurrentTime(0);
    }

    this.stateService.setPlaying(true);
  }

  /**
   * Pause playback.
   */
  pause(): void {
    this.stateService.setPlaying(false);
  }

  /**
   * Toggle play/pause.
   */
  togglePlayPause(): void {
    if (this.stateService.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Stop playback and reset to beginning.
   */
  stop(): void {
    this.pause();
    this.stateService.setCurrentTime(0);
  }

  /**
   * Seek to a specific time.
   */
  seekTo(time: number): void {
    const clamped = Math.max(0, Math.min(time, this.stateService.totalDuration()));
    this.stateService.setCurrentTime(clamped);
  }

  /**
   * Step forward/backward by one frame.
   */
  stepFrame(direction: 1 | -1): void {
    const fps = this.stateService.frameRate();
    const frameDuration = 1 / fps;
    const current = this.stateService.currentTime();
    this.seekTo(current + frameDuration * direction);
  }

  /**
   * Jump to the start of the timeline.
   */
  jumpToStart(): void {
    this.seekTo(0);
  }

  /**
   * Jump to the end of the timeline.
   */
  jumpToEnd(): void {
    this.seekTo(this.stateService.totalDuration());
  }

  ngOnDestroy(): void {
    this.pause();
  }
}
