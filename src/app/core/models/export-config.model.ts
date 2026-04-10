// =============================================================================
// Export Configuration Model
// =============================================================================

import { Resolution } from './project-state.model';

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'avi';
export type ExportQuality = 'low' | 'medium' | 'high' | 'lossless';

export interface ExportSettings {
  readonly format: ExportFormat;
  readonly resolution: Resolution;
  readonly quality: ExportQuality;
  readonly frameRate: number;
  readonly audioBitrate: string;
  readonly outputPath: string;
}

/** Map quality labels to CRF values (lower = better quality, larger file). */
export const QUALITY_CRF_MAP: Record<ExportQuality, number> = {
  low: 35,
  medium: 23,
  high: 18,
  lossless: 0,
};

/** Default export settings. */
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolution: { width: 1920, height: 1080, label: '1080p' },
  quality: 'high',
  frameRate: 30,
  audioBitrate: '192k',
  outputPath: '',
};
