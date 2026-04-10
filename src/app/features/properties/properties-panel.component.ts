import { Component, inject, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ProjectStateService } from '../../core/services/project-state.service';
import { Clip, ClipFilter, FILTER_DEFAULTS, FilterType } from '../../core/models/clip.model';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css',
})
export class PropertiesPanelComponent {
  readonly stateService = inject(ProjectStateService);

  /** The clip being inspected. */
  readonly clip = this.stateService.primarySelectedClip;

  /** Whether a clip is selected. */
  readonly hasSelection = computed(() => this.clip() !== null);

  /** Available filter types. */
  readonly filterTypes: FilterType[] = Object.keys(FILTER_DEFAULTS) as FilterType[];

  // --- Event Handlers ---

  onVolumeChange(event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const value = +(event.target as HTMLInputElement).value;
    this.stateService.setVolume(clip.id, value / 100);
  }

  onOpacityChange(event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const value = +(event.target as HTMLInputElement).value;
    this.stateService.setOpacity(clip.id, value / 100);
  }

  onSpeedChange(event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const value = +(event.target as HTMLSelectElement).value;
    this.stateService.setPlaybackRate(clip.id, value);
  }

  onToggleMute(): void {
    const clip = this.clip();
    if (clip) this.stateService.toggleMute(clip.id);
  }

  onAddFilter(event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const type = (event.target as HTMLSelectElement).value as FilterType;
    if (!type) return;

    const defaults = FILTER_DEFAULTS[type];
    if (!defaults) return;

    const filter: ClipFilter = {
      id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      type,
      params: { ...defaults.params },
      enabled: true,
    };

    this.stateService.applyFilter(clip.id, filter);
    (event.target as HTMLSelectElement).value = '';
  }

  onRemoveFilter(filterId: string): void {
    const clip = this.clip();
    if (clip) this.stateService.removeFilter(clip.id, filterId);
  }

  onTrimIn(event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const val = +(event.target as HTMLInputElement).value;
    this.stateService.trimClip(clip.id, val, clip.outPoint);
  }

  onTrimOut(event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const val = +(event.target as HTMLInputElement).value;
    this.stateService.trimClip(clip.id, clip.inPoint, val);
  }

  // --- Filter Helpers ---

  getFilterRanges(type: FilterType) {
    return FILTER_DEFAULTS[type]?.ranges || {};
  }

  getFilterParamKeys(type: FilterType): string[] {
    return Object.keys(FILTER_DEFAULTS[type]?.params || {});
  }

  onFilterParamChange(filterId: string, paramKey: string, event: Event): void {
    const clip = this.clip();
    if (!clip) return;
    const value = +(event.target as HTMLInputElement).value;
    this.stateService.updateFilter(clip.id, filterId, { [paramKey]: value });
  }
}
