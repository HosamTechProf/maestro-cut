import {
  Component, inject, computed, viewChild, ElementRef, NgZone,
  AfterViewInit, OnDestroy, signal,
} from '@angular/core';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { ProjectStateService } from '../../core/services/project-state.service';
import { PlaybackService } from '../../core/services/playback.service';
import { Clip, Track, getClipEffectiveDuration, getClipEndTime } from '../../core/models/clip.model';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CdkDrag],
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.css',
})
export class TimelineComponent implements AfterViewInit, OnDestroy {
  readonly stateService = inject(ProjectStateService);
  readonly playbackService = inject(PlaybackService);
  private readonly ngZone = inject(NgZone);

  readonly timelineArea = viewChild<ElementRef<HTMLDivElement>>('timelineArea');

  readonly clips = this.stateService.clips;
  readonly tracks = this.stateService.tracks;
  readonly zoom = this.stateService.zoom;
  readonly currentTime = this.stateService.currentTime;
  readonly totalDuration = this.stateService.totalDuration;
  readonly selectedClipIds = this.stateService.selectedClipIds;

  /** Measured container width (updated on resize). */
  readonly containerWidth = signal(800);

  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    const el = this.timelineArea()?.nativeElement;
    if (el) {
      this.containerWidth.set(el.clientWidth);
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          this.ngZone.run(() => this.containerWidth.set(entry.contentRect.width));
        }
      });
      this.resizeObserver.observe(el);

      // Ctrl+Wheel zoom, regular Wheel horizontal scroll
      el.addEventListener('wheel', (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
          this.ngZone.run(() => {
            this.stateService.setZoom(this.zoom() * zoomFactor);
          });
        }
      }, { passive: false });
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  // =========================================================================
  // Computed Values
  // =========================================================================

  /** Width of the timeline content — fills container or stretches for content. */
  readonly timelineWidth = computed(() => {
    const contentWidth = this.totalDuration() * this.zoom() + 200;
    return Math.max(contentWidth, this.containerWidth());
  });

  /** Time ruler markers. */
  readonly rulerMarkers = computed(() => {
    const z = this.zoom();
    const totalW = this.timelineWidth();
    const markers: { time: number; x: number; label: string; major: boolean }[] = [];

    let interval: number;
    if (z >= 200) interval = 0.5;
    else if (z >= 100) interval = 1;
    else if (z >= 50) interval = 2;
    else if (z >= 25) interval = 5;
    else if (z >= 10) interval = 10;
    else if (z >= 5) interval = 30;   // 30s intervals
    else if (z >= 2) interval = 60;   // 1 minute intervals
    else interval = 300;              // 5 minute intervals

    const majorEvery = interval >= 5 ? 1 : (interval >= 1 ? 5 : 10);

    let i = 0;
    let count = 0;
    while (i * z <= totalW) {
      const major = count % majorEvery === 0;
      markers.push({
        time: i,
        x: i * z,
        label: major ? this.formatRulerTime(i) : '',
        major,
      });
      i += interval;
      count++;
      if (markers.length > 500) break;
    }

    return markers;
  });

  /** Playhead X position. */
  readonly playheadX = computed(() => this.currentTime() * this.zoom());

  // =========================================================================
  // Pixel ↔ Time Conversion
  // =========================================================================

  pixelsToTime(px: number): number {
    return px / this.zoom();
  }

  timeToPixels(time: number): number {
    return time * this.zoom();
  }

  // =========================================================================
  // Clip Positioning
  // =========================================================================

  getClipLeft(clip: Clip): number {
    return clip.startTime * this.zoom();
  }

  getClipWidth(clip: Clip): number {
    return Math.max(4, getClipEffectiveDuration(clip) * this.zoom());
  }

  getClipTop(clip: Clip): number {
    const track = this.tracks().find((t) => t.id === clip.trackId);
    if (!track) return 0;
    let top = 0;
    for (const t of this.tracks()) {
      if (t.id === track.id) break;
      top += t.height;
    }
    return top;
  }

  getClipHeight(clip: Clip): number {
    const track = this.tracks().find((t) => t.id === clip.trackId);
    return track?.height ?? 80;
  }

  isClipSelected(clip: Clip): boolean {
    return this.selectedClipIds().includes(clip.id);
  }

  /** Trimmed duration text for display inside the clip. */
  getClipDurationLabel(clip: Clip): string {
    const dur = getClipEffectiveDuration(clip);
    if (dur < 60) return `${dur.toFixed(1)}s`;
    const m = Math.floor(dur / 60);
    const s = Math.floor(dur % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // =========================================================================
  // Track Positioning
  // =========================================================================

  getTrackTop(track: Track): number {
    let top = 0;
    for (const t of this.tracks()) {
      if (t.id === track.id) break;
      top += t.height;
    }
    return top;
  }

  totalTracksHeight(): number {
    return this.tracks().reduce((sum, t) => sum + t.height, 0);
  }

  // =========================================================================
  // Seeking — Ruler & Timeline
  // =========================================================================

  /** Ruler mousedown — enables click-and-drag scrubbing. */
  onRulerMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation(); // Prevent timeline click from also firing

    const wasPlaying = this.stateService.isPlaying();
    if (wasPlaying) this.playbackService.pause();

    this.seekFromMouseEvent(event);

    const onMouseMove = (e: MouseEvent) => {
      this.ngZone.run(() => this.seekFromMouseEvent(e));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (wasPlaying) this.ngZone.run(() => this.playbackService.play());
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /** Click on the timeline track area (empty space) to seek + deselect. */
  onTimelineAreaMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    // Ignore if clicking on a clip block or trim handle
    if ((event.target as HTMLElement).closest('.clip-block')) return;

    event.preventDefault();

    const wasPlaying = this.stateService.isPlaying();
    if (wasPlaying) this.playbackService.pause();

    this.seekFromMouseEvent(event);
    this.stateService.deselectAll();

    const onMouseMove = (e: MouseEvent) => {
      this.ngZone.run(() => this.seekFromMouseEvent(e));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (wasPlaying) this.ngZone.run(() => this.playbackService.play());
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /** Convert mouse event X to timeline time, accounting for scroll. */
  private seekFromMouseEvent(event: MouseEvent): void {
    const timelineEl = this.timelineArea()?.nativeElement;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const x = event.clientX - rect.left + timelineEl.scrollLeft;
    const time = this.pixelsToTime(x);
    this.playbackService.seekTo(Math.max(0, time));
  }

  // =========================================================================
  // Clip Interactions
  // =========================================================================

  /** Select a clip (click). */
  onClipClick(event: MouseEvent, clip: Clip): void {
    event.stopPropagation();
    const addToSelection = event.shiftKey || event.metaKey || event.ctrlKey;
    this.stateService.selectClips([clip.id], addToSelection);
  }

  /**
   * Handle clip drag end — supports both X (time) and Y (track change).
   * Free drag: no axis lock so the user can move horizontally and vertically.
   */
  onClipDragEnded(event: CdkDragEnd, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaY = event.distance.y;
    const deltaTime = this.pixelsToTime(deltaX);
    const newStartTime = Math.max(0, clip.startTime + deltaTime);

    // Determine target track from Y offset
    let targetTrackId = clip.trackId;
    if (Math.abs(deltaY) > 10) {
      const currentTop = this.getClipTop(clip) + this.getClipHeight(clip) / 2;
      const newY = currentTop + deltaY;
      const targetTrack = this.getTrackAtY(newY);
      if (targetTrack && targetTrack.type === this.getTrackType(clip.trackId)) {
        targetTrackId = targetTrack.id;
      }
    }

    this.stateService.moveClip(clip.id, newStartTime, targetTrackId);
    event.source.reset();
  }

  /** Find which track is at a given Y pixel position in the tracks area. */
  private getTrackAtY(y: number): Track | null {
    let accumulatedY = 0;
    for (const track of this.tracks()) {
      if (y >= accumulatedY && y < accumulatedY + track.height) {
        return track;
      }
      accumulatedY += track.height;
    }
    return null;
  }

  /** Get the type of a track by ID. */
  private getTrackType(trackId: string): 'video' | 'audio' {
    return this.tracks().find((t) => t.id === trackId)?.type ?? 'video';
  }

  // =========================================================================
  // Trim Handles
  // =========================================================================

  onLeftTrimEnd(event: CdkDragEnd, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaTime = this.pixelsToTime(deltaX);
    const newInPoint = Math.max(0, Math.min(clip.outPoint - 0.1, clip.inPoint + deltaTime));
    this.stateService.trimClip(clip.id, newInPoint, clip.outPoint);
    event.source.reset();
  }

  onRightTrimEnd(event: CdkDragEnd, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaTime = this.pixelsToTime(deltaX);
    const newOutPoint = Math.min(clip.duration, Math.max(clip.inPoint + 0.1, clip.outPoint + deltaTime));
    this.stateService.trimClip(clip.id, clip.inPoint, newOutPoint);
    event.source.reset();
  }

  // =========================================================================
  // Track Header Controls
  // =========================================================================

  onToggleTrackMute(trackId: string): void {
    this.stateService.toggleTrackMute(trackId);
  }

  onToggleTrackLock(trackId: string): void {
    this.stateService.toggleTrackLock(trackId);
  }

  onToggleTrackVisibility(trackId: string): void {
    this.stateService.toggleTrackVisibility(trackId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private formatRulerTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  trackById(_index: number, track: Track): string {
    return track.id;
  }

  clipById(_index: number, clip: Clip): string {
    return clip.id;
  }
}
