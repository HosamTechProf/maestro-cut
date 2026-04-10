import { Component, inject, computed, viewChild, ElementRef, NgZone } from '@angular/core';
import { CdkDrag, CdkDragMove, CdkDragEnd } from '@angular/cdk/drag-drop';
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
export class TimelineComponent {
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

  /** Width of the timeline content area in pixels. */
  readonly timelineWidth = computed(() => {
    const dur = this.totalDuration();
    const z = this.zoom();
    return Math.max(dur * z + 200, 800); // Minimum 800px, extra space at end
  });

  /** Time ruler markers. */
  readonly rulerMarkers = computed(() => {
    const z = this.zoom();
    const totalW = this.timelineWidth();
    const markers: { time: number; x: number; label: string; major: boolean }[] = [];

    // Calculate interval based on zoom level
    let interval: number;
    if (z >= 200) interval = 0.5;
    else if (z >= 100) interval = 1;
    else if (z >= 50) interval = 2;
    else if (z >= 25) interval = 5;
    else interval = 10;

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
      if (markers.length > 500) break; // Safety limit
    }

    return markers;
  });

  /** Playhead X position. */
  readonly playheadX = computed(() => this.currentTime() * this.zoom());

  // --- Pixel ↔ Time Conversion ---

  pixelsToTime(px: number): number {
    return px / this.zoom();
  }

  timeToPixels(time: number): number {
    return time * this.zoom();
  }

  // --- Clip Positioning ---

  getClipLeft(clip: Clip): number {
    return clip.startTime * this.zoom();
  }

  getClipWidth(clip: Clip): number {
    return getClipEffectiveDuration(clip) * this.zoom();
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

  // --- Track Header Heights ---

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

  // --- Event Handlers ---

  /** Click on the ruler to seek. */
  onRulerClick(event: MouseEvent): void {
    this.seekFromMouse(event);
  }

  /** Start dragging on the ruler to scrub. */
  onRulerMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Left button only
    event.preventDefault();

    // Pause during scrub
    const wasPlaying = this.stateService.isPlaying();
    if (wasPlaying) this.playbackService.pause();

    this.seekFromMouse(event);

    const onMouseMove = (e: MouseEvent) => {
      this.ngZone.run(() => this.seekFromMouse(e));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // Resume playback if it was playing before scrub
      if (wasPlaying) this.ngZone.run(() => this.playbackService.play());
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  /** Helper: calculate time from a mouse event on the ruler/timeline. */
  private seekFromMouse(event: MouseEvent): void {
    const timelineEl = this.timelineArea()?.nativeElement;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const x = event.clientX - rect.left + timelineEl.scrollLeft;
    const time = this.pixelsToTime(x);
    this.playbackService.seekTo(Math.max(0, time));
  }

  /** Click on the timeline area to seek or deselect. */
  onTimelineClick(event: MouseEvent): void {
    // Only handle clicks on the empty area, not clips
    if ((event.target as HTMLElement).closest('.clip-block')) return;

    // Seek to clicked position
    this.seekFromMouse(event);
    this.stateService.deselectAll();
  }

  /** Select a clip. */
  onClipClick(event: MouseEvent, clip: Clip): void {
    event.stopPropagation();
    const addToSelection = event.shiftKey || event.metaKey || event.ctrlKey;
    this.stateService.selectClips([clip.id], addToSelection);
  }

  /** Handle clip drag (move). */
  onClipDragEnded(event: CdkDragEnd, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaTime = this.pixelsToTime(deltaX);
    const newStartTime = Math.max(0, clip.startTime + deltaTime);
    this.stateService.moveClip(clip.id, newStartTime);
    event.source.reset(); // Reset CDK transform
  }

  /** Handle left trim handle drag. */
  onLeftTrimMove(event: CdkDragMove, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaTime = this.pixelsToTime(deltaX);
    const newInPoint = Math.max(0, Math.min(clip.outPoint - 0.1, clip.inPoint + deltaTime));
    // Live preview (no command yet — command on drag end)
  }

  onLeftTrimEnd(event: CdkDragEnd, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaTime = this.pixelsToTime(deltaX);
    const newInPoint = Math.max(0, Math.min(clip.outPoint - 0.1, clip.inPoint + deltaTime));
    this.stateService.trimClip(clip.id, newInPoint, clip.outPoint);
    event.source.reset();
  }

  /** Handle right trim handle drag. */
  onRightTrimEnd(event: CdkDragEnd, clip: Clip): void {
    const deltaX = event.distance.x;
    const deltaTime = this.pixelsToTime(deltaX);
    const newOutPoint = Math.min(clip.duration, Math.max(clip.inPoint + 0.1, clip.outPoint + deltaTime));
    this.stateService.trimClip(clip.id, clip.inPoint, newOutPoint);
    event.source.reset();
  }

  /** Toggle track mute. */
  onToggleTrackMute(trackId: string): void {
    this.stateService.toggleTrackMute(trackId);
  }

  /** Toggle track lock. */
  onToggleTrackLock(trackId: string): void {
    this.stateService.toggleTrackLock(trackId);
  }

  /** Toggle track visibility. */
  onToggleTrackVisibility(trackId: string): void {
    this.stateService.toggleTrackVisibility(trackId);
  }

  // --- Helpers ---

  private formatRulerTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  trackById(_index: number, track: Track): string {
    return track.id;
  }

  clipById(_index: number, clip: Clip): string {
    return clip.id;
  }
}
