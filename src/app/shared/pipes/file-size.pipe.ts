import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a file size in bytes to a human-readable string.
 * Usage: {{ 1536000 | fileSize }} → "1.46 MB"
 */
@Pipe({ name: 'fileSize', standalone: true })
export class FileSizePipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    if (bytes == null || isNaN(bytes) || bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const factor = 1024;
    let unitIndex = 0;
    let size = Math.abs(bytes);

    while (size >= factor && unitIndex < units.length - 1) {
      size /= factor;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
  }
}
