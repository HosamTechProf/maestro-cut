// =============================================================================
// FFmpeg Export Engine — State → FFmpeg Pipeline Mapper
// =============================================================================
// Takes a serialized ProjectState and produces a rendered video file.
// Handles: single/multi-clip concat, filters, volume, playback rate,
// resolution scaling, and multi-track audio mixing.
// =============================================================================

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { sanitizeFilePath, sanitizeTime, sanitizePlaybackRate, sanitizeVolume,
        sanitizeCRF, sanitizeFrameRate, sanitizeAudioBitrate } = require('./input-sanitizer');
const { buildFilterChain } = require('./filter-builder');

// Quality → CRF mapping (lower = better quality)
const QUALITY_CRF = {
  low: 35,
  medium: 23,
  high: 18,
  lossless: 0,
};

// Codec map by format
const FORMAT_CODECS = {
  mp4:  { video: 'libx264', audio: 'aac' },
  webm: { video: 'libvpx-vp9', audio: 'libopus' },
  mov:  { video: 'libx264', audio: 'aac' },
  avi:  { video: 'libx264', audio: 'aac' },
};

/**
 * @typedef {Object} ExportJob
 * @property {Object} config - Sanitized export configuration
 * @property {Function} onProgress - Progress callback
 * @property {AbortController} abortController - To cancel the export
 */

class FFmpegEngine {
  constructor() {
    this.currentProcess = null;
    this.tempDir = null;
  }

  /**
   * Execute a full export pipeline.
   * Steps:
   *   1. Validate & sanitize all inputs
   *   2. Create temp directory for intermediates
   *   3. Process each clip (trim, filter, speed, volume)
   *   4. Concatenate all clips
   *   5. Scale to output resolution
   *   6. Encode final output
   *   7. Clean up temp files
   */
  async export(config, onProgress) {
    const { state, outputPath, format, resolution, quality, frameRate, audioBitrate } = config;

    // Create temp directory
    this.tempDir = path.join(os.tmpdir(), `nle-export-${Date.now()}`);
    fs.mkdirSync(this.tempDir, { recursive: true });

    try {
      onProgress({
        percent: 0,
        currentTime: 0,
        totalDuration: this._calculateTotalDuration(state),
        fps: 0,
        speed: '0x',
        estimatedTimeRemaining: 0,
        stage: 'preparing',
      });

      // Get clips sorted by startTime (video track only for now)
      const clips = (state.clips || [])
        .filter((c) => {
          const track = (state.tracks || []).find((t) => t.id === c.trackId);
          return track && track.type === 'video';
        })
        .sort((a, b) => a.startTime - b.startTime);

      if (clips.length === 0) {
        throw new Error('No video clips to export');
      }

      // Process each clip individually
      const processedClips = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const outputFile = path.join(this.tempDir, `clip_${i}.mp4`);

        const clipProgress = (i / clips.length) * 80; // 0–80% for clip processing
        onProgress({
          percent: clipProgress,
          currentTime: 0,
          totalDuration: this._calculateTotalDuration(state),
          fps: 0,
          speed: '0x',
          estimatedTimeRemaining: 0,
          stage: 'encoding',
        });

        await this._processClip(clip, outputFile, resolution, frameRate);
        processedClips.push(outputFile);
      }

      // Concatenate clips
      onProgress({
        percent: 85,
        currentTime: 0,
        totalDuration: this._calculateTotalDuration(state),
        fps: 0,
        speed: '0x',
        estimatedTimeRemaining: 0,
        stage: 'finalizing',
      });

      if (processedClips.length === 1) {
        // Single clip — just re-encode to final format
        await this._encodeOutput(processedClips[0], outputPath, format, quality, frameRate, audioBitrate, resolution, (progress) => {
          onProgress({
            ...progress,
            percent: 85 + (progress.percent * 0.15),
            stage: 'finalizing',
          });
        });
      } else {
        // Multiple clips — concatenate then encode
        const concatFile = path.join(this.tempDir, 'concat.mp4');
        await this._concatenateClips(processedClips, concatFile);
        await this._encodeOutput(concatFile, outputPath, format, quality, frameRate, audioBitrate, resolution, (progress) => {
          onProgress({
            ...progress,
            percent: 85 + (progress.percent * 0.15),
            stage: 'finalizing',
          });
        });
      }

      onProgress({
        percent: 100,
        currentTime: this._calculateTotalDuration(state),
        totalDuration: this._calculateTotalDuration(state),
        fps: 0,
        speed: '0x',
        estimatedTimeRemaining: 0,
        stage: 'complete',
      });

    } finally {
      // Clean up temp directory
      this._cleanup();
    }
  }

  /**
   * Cancel the current export.
   */
  cancel() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGKILL');
      this.currentProcess = null;
    }
    this._cleanup();
  }

  /**
   * Process a single clip: trim, apply filters, adjust speed & volume.
   */
  _processClip(clip, outputPath, resolution, frameRate) {
    return new Promise((resolve, reject) => {
      const inputPath = sanitizeFilePath(clip.filePath);
      const inPoint = sanitizeTime(clip.inPoint);
      const outPoint = sanitizeTime(clip.outPoint);
      const duration = outPoint - inPoint;
      const playbackRate = sanitizePlaybackRate(clip.playbackRate);
      const volume = sanitizeVolume(clip.isMuted ? 0 : clip.volume);

      let command = ffmpeg(inputPath)
        .inputOptions([`-ss ${inPoint}`, `-t ${duration}`]);

      // Build video filter chain
      const videoFilters = [];

      // Clip-specific visual filters
      const clipFilters = (clip.filters || []).map((f) => {
        // Inject clip duration for fade-out calculation
        if (f.type === 'fade-out') {
          return { ...f, params: { ...f.params, __clipDuration: duration } };
        }
        return f;
      });

      const filterChain = buildFilterChain(clipFilters);
      if (filterChain) {
        videoFilters.push(filterChain);
      }

      // Playback rate adjustment
      if (playbackRate !== 1) {
        videoFilters.push(`setpts=${(1 / playbackRate).toFixed(6)}*PTS`);
      }

      // Scale to output resolution
      videoFilters.push(`scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:color=black`);

      // Set frame rate
      videoFilters.push(`fps=${frameRate}`);

      // Apply video filters
      if (videoFilters.length > 0) {
        command = command.videoFilters(videoFilters);
      }

      // Audio filters
      const audioFilters = [];
      audioFilters.push(`volume=${volume}`);
      if (playbackRate !== 1) {
        audioFilters.push(`atempo=${playbackRate}`);
      }
      command = command.audioFilters(audioFilters);

      // Output settings
      command
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 18',
          '-c:a aac',
          '-b:a 192k',
          '-pix_fmt yuv420p',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err));

      this.currentProcess = command;
      command.run();
    });
  }

  /**
   * Concatenate multiple intermediate clip files using FFmpeg's concat demuxer.
   */
  _concatenateClips(clipPaths, outputPath) {
    return new Promise((resolve, reject) => {
      // Create concat list file
      const listPath = path.join(this.tempDir, 'concat_list.txt');
      const listContent = clipPaths.map((p) => `file '${p}'`).join('\n');
      fs.writeFileSync(listPath, listContent, 'utf-8');

      const command = ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err));

      this.currentProcess = command;
      command.run();
    });
  }

  /**
   * Final encoding pass — applies format-specific codecs and quality settings.
   */
  _encodeOutput(inputPath, outputPath, format, quality, frameRate, audioBitrate, resolution, onProgress) {
    return new Promise((resolve, reject) => {
      const codecs = FORMAT_CODECS[format] || FORMAT_CODECS.mp4;
      const crf = sanitizeCRF(QUALITY_CRF[quality] ?? 18);
      const fps = sanitizeFrameRate(frameRate);
      const abr = sanitizeAudioBitrate(audioBitrate);

      const outputOptions = [
        `-c:v ${codecs.video}`,
        `-c:a ${codecs.audio}`,
        `-b:a ${abr}`,
        '-pix_fmt yuv420p',
        `-r ${fps}`,
      ];

      // CRF / quality options based on codec
      if (codecs.video === 'libx264') {
        outputOptions.push(`-crf ${crf}`, '-preset medium');
      } else if (codecs.video === 'libvpx-vp9') {
        outputOptions.push(`-crf ${crf}`, '-b:v 0');
      }

      let totalDuration = 0;

      const command = ffmpeg(inputPath)
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('codecData', (data) => {
          // Parse duration from codec data
          if (data.duration) {
            const parts = data.duration.split(':').map(Number);
            totalDuration = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
          }
        })
        .on('progress', (progress) => {
          if (onProgress) {
            onProgress({
              percent: progress.percent || 0,
              currentTime: progress.timemark ? this._timemarkToSeconds(progress.timemark) : 0,
              totalDuration,
              fps: progress.currentFps || 0,
              speed: progress.currentSpeed || '0x',
              estimatedTimeRemaining: 0,
            });
          }
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));

      this.currentProcess = command;
      command.run();
    });
  }

  /**
   * Calculate total duration from clips.
   */
  _calculateTotalDuration(state) {
    if (!state.clips || state.clips.length === 0) return 0;
    return Math.max(...state.clips.map((c) => {
      const effectiveDuration = (c.outPoint - c.inPoint) / (c.playbackRate || 1);
      return c.startTime + effectiveDuration;
    }));
  }

  /**
   * Convert FFmpeg timemark "HH:MM:SS.ms" to seconds.
   */
  _timemarkToSeconds(timemark) {
    if (!timemark) return 0;
    const parts = timemark.split(':');
    if (parts.length !== 3) return 0;
    return (
      parseFloat(parts[0]) * 3600 +
      parseFloat(parts[1]) * 60 +
      parseFloat(parts[2])
    );
  }

  /**
   * Clean up temporary files.
   */
  _cleanup() {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('[FFmpegEngine] Failed to clean up temp dir:', err.message);
      }
      this.tempDir = null;
    }
  }
}

module.exports = { FFmpegEngine };
