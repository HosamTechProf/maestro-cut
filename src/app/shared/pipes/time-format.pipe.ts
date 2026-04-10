import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a time value (in seconds) to a timecode string.
 * Usage: {{ 125.5 | timeFormat }}        → "02:05.5"
 * Usage: {{ 125.5 | timeFormat:'full' }} → "00:02:05:15"
 */
@Pipe({ name: 'timeFormat', standalone: true })
export class TimeFormatPipe implements PipeTransform {
  transform(seconds: number | null | undefined, format: 'short' | 'full' | 'frames' = 'short', fps = 30): string {
    if (seconds == null || isNaN(seconds)) return '00:00';

    const totalSeconds = Math.max(0, seconds);

    if (format === 'full') {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = Math.floor(totalSeconds % 60);
      const f = Math.floor((totalSeconds % 1) * fps);
      return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}:${this.pad(f)}`;
    }

    if (format === 'frames') {
      const m = Math.floor(totalSeconds / 60);
      const s = Math.floor(totalSeconds % 60);
      const f = Math.floor((totalSeconds % 1) * fps);
      return `${this.pad(m)}:${this.pad(s)}:${this.pad(f)}`;
    }

    // 'short' format
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 10);
    return `${this.pad(m)}:${this.pad(s)}.${ms}`;
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0');
  }
}
