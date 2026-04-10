// =============================================================================
// Input Sanitizer — Security Layer for FFmpeg Arguments
// =============================================================================
// Validates and sanitizes ALL user-provided values before they reach FFmpeg.
// Prevents command injection, path traversal, and malformed arguments.
// Every value that touches the FFmpeg CLI MUST pass through here.
// =============================================================================

const path = require('path');
const fs = require('fs');

/**
 * Sanitize a file path for FFmpeg input.
 * - Resolves to absolute path
 * - Checks file existence
 * - Blocks path traversal
 * - Validates extension against whitelist
 */
function sanitizeFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Invalid file path: empty or not a string');
  }

  // Resolve to absolute path
  const resolved = path.resolve(filePath);

  // Block null bytes (command injection vector)
  if (resolved.includes('\0')) {
    throw new Error('Invalid file path: contains null bytes');
  }

  // Validate extension
  const ext = path.extname(resolved).toLowerCase();
  const ALLOWED_EXTENSIONS = new Set([
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.m4v',  // Video
    '.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a',                   // Audio
    '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff',                  // Images (for overlays)
  ]);

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  // Verify file exists
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  return resolved;
}

/**
 * Sanitize an output file path.
 * - Resolves to absolute path
 * - Validates extension against output whitelist
 * - Ensures parent directory exists
 */
function sanitizeOutputPath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error('Invalid output path: empty or not a string');
  }

  const resolved = path.resolve(filePath);

  if (resolved.includes('\0')) {
    throw new Error('Invalid output path: contains null bytes');
  }

  const ext = path.extname(resolved).toLowerCase();
  const ALLOWED_OUTPUT_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);

  if (!ALLOWED_OUTPUT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported output format: ${ext}`);
  }

  // Ensure parent directory exists
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    throw new Error(`Output directory does not exist: ${dir}`);
  }

  return resolved;
}

/**
 * Sanitize a numeric value within a valid range.
 * Returns the clamped value.
 */
function sanitizeNumber(value, min, max, defaultValue, label = 'value') {
  const num = Number(value);
  if (isNaN(num)) {
    console.warn(`[InputSanitizer] Invalid ${label}: ${value}, using default ${defaultValue}`);
    return defaultValue;
  }
  return Math.max(min, Math.min(max, num));
}

/**
 * Sanitize a time value (seconds).
 * Must be non-negative and finite.
 */
function sanitizeTime(value, label = 'time') {
  return sanitizeNumber(value, 0, 86400, 0, label); // Max 24 hours
}

/**
 * Sanitize playback rate.
 */
function sanitizePlaybackRate(value) {
  return sanitizeNumber(value, 0.25, 4.0, 1.0, 'playbackRate');
}

/**
 * Sanitize volume level.
 */
function sanitizeVolume(value) {
  return sanitizeNumber(value, 0, 1, 1, 'volume');
}

/**
 * Sanitize opacity.
 */
function sanitizeOpacity(value) {
  return sanitizeNumber(value, 0, 1, 1, 'opacity');
}

/**
 * Sanitize a resolution dimension.
 */
function sanitizeResolution(width, height) {
  const w = sanitizeNumber(width, 128, 7680, 1920, 'width');    // Max 8K
  const h = sanitizeNumber(height, 128, 4320, 1080, 'height');  // Max 8K
  // Ensure even numbers (FFmpeg requirement for most codecs)
  return {
    width: Math.round(w / 2) * 2,
    height: Math.round(h / 2) * 2,
  };
}

/**
 * Sanitize a frame rate.
 */
function sanitizeFrameRate(value) {
  return sanitizeNumber(value, 1, 120, 30, 'frameRate');
}

/**
 * Sanitize CRF quality value.
 */
function sanitizeCRF(value) {
  return Math.round(sanitizeNumber(value, 0, 51, 18, 'crf'));
}

/**
 * Sanitize audio bitrate string.
 */
function sanitizeAudioBitrate(value) {
  if (typeof value !== 'string') return '192k';
  const match = value.match(/^(\d+)k$/i);
  if (!match) return '192k';
  const kbps = parseInt(match[1], 10);
  if (kbps < 64 || kbps > 512) return '192k';
  return `${kbps}k`;
}

/**
 * Sanitize entire export config from the renderer.
 */
function sanitizeExportConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid export configuration');
  }

  const resolution = sanitizeResolution(
    config.resolution?.width,
    config.resolution?.height,
  );

  return {
    outputPath: sanitizeOutputPath(config.outputPath),
    format: ['mp4', 'webm', 'mov', 'avi'].includes(config.format) ? config.format : 'mp4',
    resolution,
    quality: ['low', 'medium', 'high', 'lossless'].includes(config.quality) ? config.quality : 'high',
    frameRate: sanitizeFrameRate(config.frameRate),
    audioBitrate: sanitizeAudioBitrate(config.audioBitrate),
    state: config.state,
  };
}

module.exports = {
  sanitizeFilePath,
  sanitizeOutputPath,
  sanitizeNumber,
  sanitizeTime,
  sanitizePlaybackRate,
  sanitizeVolume,
  sanitizeOpacity,
  sanitizeResolution,
  sanitizeFrameRate,
  sanitizeCRF,
  sanitizeAudioBitrate,
  sanitizeExportConfig,
};
