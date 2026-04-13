// =============================================================================
// Video Preview Component — Owns the HTML5 Video Element
// =============================================================================
// ARCHITECTURE:
//   PLAYING  → video.currentTime is MASTER → rAF reads it → updates state
//   PAUSED   → state.currentTime is MASTER → we write to video.currentTime
// =============================================================================

import { Component, inject, computed, viewChild, ElementRef, effect, OnDestroy, NgZone } from '@angular/core';
import { ProjectStateService } from '../../core/services/project-state.service';
import { PlaybackService } from '../../core/services/playback.service';
import { TimeFormatPipe } from '../../shared/pipes/time-format.pipe';
import { ClipFilter, Clip, getClipEndTime, getClipEffectiveDuration } from '../../core/models/clip.model';

@Component({
  selector: 'app-video-preview',
  standalone: true,
  imports: [TimeFormatPipe],
  templateUrl: './video-preview.component.html',
  styleUrl: './video-preview.component.css',
})
export class VideoPreviewComponent implements OnDestroy {
  readonly stateService = inject(ProjectStateService);
  readonly playbackService = inject(PlaybackService);
  private readonly ngZone = inject(NgZone);

  readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoPlayer');

  // =========================================================================
  // Public Signals for Template
  // =========================================================================

  readonly activeClip = this.stateService.activeClipAtPlayhead;
  readonly hasAnyClip = computed(() => this.stateService.clips().length > 0);

  readonly cssFilterString = computed(() => {
    const clip = this.activeClip();
    if (!clip || clip.filters.length === 0) return 'none';
    return clip.filters
      .filter((f) => f.enabled)
      .map((f) => this.filterToCss(f))
      .join(' ') || 'none';
  });

  readonly clipOpacity = computed(() => this.activeClip()?.opacity ?? 1);

  // =========================================================================
  // Internal State
  // =========================================================================

  private loadedSrc = '';
  private loadedClipId = '';
  private loadedClipFingerprint = '';
  private rAFId: number | null = null;
  private frameCount = 0;
  private fpsTimestamp = 0;
  private isPlaying = false;
  /** Pending seek target — set when source needs loading before seek. */
  private pendingSeek: number | null = null;

  constructor() {
    // -----------------------------------------------------------------
    // EFFECT: Respond to isPlaying changes + scrub when paused
    // -----------------------------------------------------------------
    effect(() => {
      const playState = this.stateService.isPlaying();
      const currentTime = this.stateService.currentTime();
      const clip = this.activeClip();
      const video = this.videoElement()?.nativeElement;

      if (!video) return;

      if (playState && !this.isPlaying) {
        // === TRANSITION: paused → playing ===
        this.doPlay(video, clip, currentTime);
      } else if (!playState && this.isPlaying) {
        // === TRANSITION: playing → paused ===
        this.doPause(video);
        if (clip) {
          this.safeSeek(video, this.mapTimelineToSource(currentTime, clip));
        }
      } else if (!playState && !this.isPlaying) {
        // === PAUSED: scrub — seek video to match timeline ===
        this.doScrub(video, clip, currentTime);
      }
      // If playState && this.isPlaying → playing, rAF handles it
    });
  }

  ngOnDestroy(): void {
    this.doPause(this.videoElement()?.nativeElement);
  }

  // =========================================================================
  // State Transitions
  // =========================================================================

  private doPlay(video: HTMLVideoElement, clip: Clip | null, currentTime: number): void {
    if (!clip) {
      this.playbackService.pause();
      return;
    }

    this.isPlaying = true;

    const sourceTime = this.mapTimelineToSource(currentTime, clip);
    const needsLoad = this.ensureSource(video, clip);

    // Set properties
    video.volume = clip.isMuted ? 0 : clip.volume;
    video.playbackRate = clip.playbackRate;

    if (needsLoad) {
      // Source was changed — wait for metadata before seeking + playing
      this.pendingSeek = sourceTime;
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady);
        if (!this.isPlaying) return;
        video.currentTime = this.pendingSeek ?? sourceTime;
        this.pendingSeek = null;
        this.startPlayback(video);
      };
      video.addEventListener('loadeddata', onReady);
    } else {
      // Source already loaded — seek and play immediately
      video.currentTime = sourceTime;
      this.startPlayback(video);
    }
  }

  /** Actually start video playback and the rAF loop. */
  private startPlayback(video: HTMLVideoElement): void {
    video.play().then(() => {
      this.frameCount = 0;
      this.fpsTimestamp = performance.now();
      this.runPlaybackLoop();
    }).catch((err) => {
      if (err.name === 'AbortError') return;
      console.warn('[Preview] Play failed:', err.message);
      if (this.isPlaying) {
        this.isPlaying = false;
        this.ngZone.run(() => this.playbackService.pause());
      }
    });
  }

  private doPause(video: HTMLVideoElement | undefined | null): void {
    this.isPlaying = false;
    this.pendingSeek = null;

    if (this.rAFId !== null) {
      cancelAnimationFrame(this.rAFId);
      this.rAFId = null;
    }

    if (video && !video.paused) {
      video.pause();
    }
  }

  private doScrub(video: HTMLVideoElement, clip: Clip | null, currentTime: number): void {
    if (!clip) {
      const allClips = this.stateService.clips();
      if (allClips.length > 0) {
        const nearest = this.findNearestClip(currentTime);
        if (nearest) {
          this.ensureSource(video, nearest);
          if (currentTime < nearest.startTime) {
            this.safeSeek(video, nearest.inPoint);
          } else {
            this.safeSeek(video, nearest.outPoint - 0.01);
          }
        }
      }
      return;
    }

    this.ensureSource(video, clip);
    const sourceTime = this.mapTimelineToSource(currentTime, clip);
    this.safeSeek(video, sourceTime);

    video.volume = clip.isMuted ? 0 : clip.volume;
    video.playbackRate = clip.playbackRate;
  }

  // =========================================================================
  // rAF Playback Loop — reads FROM video, writes TO state
  // =========================================================================

  private runPlaybackLoop(): void {
    this.rAFId = requestAnimationFrame((timestamp) => {
      if (!this.isPlaying) return;

      const video = this.videoElement()?.nativeElement;
      if (!video || video.paused || video.ended) {
        this.isPlaying = false;
        this.rAFId = null;

        if (video?.ended && this.playbackService.loopEnabled()) {
          this.ngZone.run(() => {
            this.stateService.setCurrentTime(0);
            setTimeout(() => this.playbackService.play(), 16);
          });
        } else {
          this.ngZone.run(() => this.playbackService.pause());
        }
        return;
      }

      // --- FPS counter ---
      this.frameCount++;
      if (timestamp - this.fpsTimestamp >= 1000) {
        this.ngZone.run(() => this.playbackService.currentFps.set(this.frameCount));
        this.frameCount = 0;
        this.fpsTimestamp = timestamp;
      }

      // --- Read video time → update state ---
      const clip = this.activeClip();
      if (clip) {
        const timelineTime = this.mapSourceToTimeline(video.currentTime, clip);

        if (video.currentTime >= clip.outPoint - 0.05) {
          const nextClip = this.findNextClip(clip);
          if (nextClip) {
            this.ensureSource(video, nextClip);
            video.currentTime = nextClip.inPoint;
            this.ngZone.run(() => this.stateService.setCurrentTime(nextClip.startTime));
          } else if (this.playbackService.loopEnabled()) {
            const firstClip = this.stateService.clips()[0];
            if (firstClip) {
              this.ensureSource(video, firstClip);
              video.currentTime = firstClip.inPoint;
              this.ngZone.run(() => this.stateService.setCurrentTime(0));
            }
          } else {
            this.isPlaying = false;
            this.rAFId = null;
            this.ngZone.run(() => this.playbackService.pause());
            return;
          }
        } else {
          this.ngZone.run(() => this.stateService.setCurrentTime(timelineTime));
        }
      }

      if (this.isPlaying) {
        this.runPlaybackLoop();
      }
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Ensure the video element has the correct source loaded.
   * Returns TRUE if a new source was loaded (async, need to wait for loadeddata).
   */
  private ensureSource(video: HTMLVideoElement, clip: Clip): boolean {
    const fingerprint = `${clip.id}:${clip.inPoint}:${clip.outPoint}`;

    if (clip.fileUrl && this.loadedSrc !== clip.fileUrl) {
      this.loadedSrc = clip.fileUrl;
      this.loadedClipId = clip.id;
      this.loadedClipFingerprint = fingerprint;
      video.src = clip.fileUrl;
      video.load();
      return true; // Needs async wait
    }

    if (this.loadedClipFingerprint !== fingerprint) {
      this.loadedClipId = clip.id;
      this.loadedClipFingerprint = fingerprint;
    }

    return false; // Already loaded
  }

  /**
   * Safely seek the video — only if the video has enough data.
   * If not ready, defers the seek to the loadeddata event.
   */
  private safeSeek(video: HTMLVideoElement, time: number): void {
    if (video.readyState >= 1) {
      // HAVE_METADATA or better — safe to seek
      video.currentTime = time;
    } else {
      // Not ready yet — defer
      const onReady = () => {
        video.removeEventListener('loadeddata', onReady);
        video.currentTime = time;
      };
      video.addEventListener('loadeddata', onReady);
    }
  }

  /** Timeline time → source media time */
  private mapTimelineToSource(timelineTime: number, clip: Clip): number {
    const raw = timelineTime - clip.startTime + clip.inPoint;
    return Math.max(clip.inPoint, Math.min(clip.outPoint - 0.01, raw));
  }

  /** Source media time → timeline time */
  private mapSourceToTimeline(sourceTime: number, clip: Clip): number {
    return sourceTime - clip.inPoint + clip.startTime;
  }

  /** Find the nearest clip to a given timeline time. */
  private findNearestClip(time: number): Clip | null {
    const clips = this.stateService.clips();
    if (clips.length === 0) return null;
    return clips.reduce((nearest, c) => {
      const dist = Math.min(Math.abs(time - c.startTime), Math.abs(time - getClipEndTime(c)));
      const nearDist = Math.min(Math.abs(time - nearest.startTime), Math.abs(time - getClipEndTime(nearest)));
      return dist < nearDist ? c : nearest;
    });
  }

  /** Find the next clip after the current one. */
  private findNextClip(currentClip: Clip): Clip | null {
    const endTime = getClipEndTime(currentClip);
    const clips = this.stateService.clips();
    return clips
      .filter(c => c.startTime >= endTime - 0.1 && c.id !== currentClip.id)
      .sort((a, b) => a.startTime - b.startTime)[0] ?? null;
  }

  // =========================================================================
  // UI Event Handlers
  // =========================================================================

  onPlayPause(): void {
    this.playbackService.togglePlayPause();
  }

  onTimelineBarClick(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const totalDuration = this.stateService.totalDuration();
    this.playbackService.seekTo(ratio * totalDuration);
  }

  // =========================================================================
  // Filter → CSS
  // =========================================================================

  private filterToCss(filter: ClipFilter): string {
    const p = filter.params;
    const getVal = (key: string, def: number) => {
      const v = Number(p[key]);
      return isNaN(v) ? def : v;
    };

    switch (filter.type) {
      case 'brightness':    return `brightness(${1 + getVal('value', 0)})`;
      case 'contrast':      return `contrast(${getVal('value', 1)})`;
      case 'saturation':    return `saturate(${getVal('value', 1)})`;
      case 'hue-rotate':    return `hue-rotate(${getVal('value', 0)}deg)`;
      case 'blur':          return `blur(${getVal('radius', 0)}px)`;
      case 'grayscale':     return `grayscale(${getVal('amount', 1)})`;
      case 'sepia':         return `sepia(${getVal('amount', 1)})`;
      case 'invert':        return `invert(${getVal('amount', 1)})`;
      default:              return '';
    }
  }
}
