// =============================================================================
// Filter Builder — Maps NLE Filters to FFmpeg Filtergraph Syntax
// =============================================================================
// Converts the application's filter model (optimized for CSS preview)
// into FFmpeg's complex filtergraph syntax.
// =============================================================================

const { sanitizeNumber } = require('./input-sanitizer');

/**
 * Build an FFmpeg filter string for a single clip's filter stack.
 * Returns an array of FFmpeg filter expressions.
 */
function buildClipFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0) return [];

  const ffmpegFilters = [];

  for (const filter of filters) {
    if (!filter.enabled) continue;

    const expression = mapFilterToFFmpeg(filter);
    if (expression) {
      ffmpegFilters.push(expression);
    }
  }

  return ffmpegFilters;
}

/**
 * Map a single NLE filter to an FFmpeg filter expression.
 */
function mapFilterToFFmpeg(filter) {
  const p = filter.params || {};

  switch (filter.type) {
    case 'brightness': {
      const val = sanitizeNumber(p.value, -1, 1, 0, 'brightness');
      return `eq=brightness=${val}`;
    }

    case 'contrast': {
      const val = sanitizeNumber(p.value, 0, 3, 1, 'contrast');
      return `eq=contrast=${val}`;
    }

    case 'saturation': {
      const val = sanitizeNumber(p.value, 0, 3, 1, 'saturation');
      return `eq=saturation=${val}`;
    }

    case 'hue-rotate': {
      const val = sanitizeNumber(p.value, 0, 360, 0, 'hue');
      return `hue=h=${val}`;
    }

    case 'blur': {
      const radius = sanitizeNumber(p.radius, 0, 20, 0, 'blur');
      if (radius === 0) return null;
      // FFmpeg's boxblur — luma and chroma radius
      const r = Math.max(1, Math.round(radius));
      return `boxblur=${r}:${r}`;
    }

    case 'grayscale': {
      const amount = sanitizeNumber(p.amount, 0, 1, 1, 'grayscale');
      // Full grayscale: use hue=s=0; partial: use saturation
      return amount >= 1 ? 'hue=s=0' : `eq=saturation=${1 - amount}`;
    }

    case 'sepia': {
      const amount = sanitizeNumber(p.amount, 0, 1, 1, 'sepia');
      if (amount === 0) return null;
      // Sepia approximation via colorchannelmixer
      return `colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0`;
    }

    case 'invert': {
      const amount = sanitizeNumber(p.amount, 0, 1, 1, 'invert');
      if (amount === 0) return null;
      return 'negate';
    }

    case 'sharpen': {
      const amount = sanitizeNumber(p.amount, 0, 5, 1, 'sharpen');
      if (amount === 0) return null;
      // unsharp mask
      return `unsharp=5:5:${amount}:5:5:${amount / 2}`;
    }

    case 'vignette': {
      const intensity = sanitizeNumber(p.intensity, 0, 1, 0.5, 'vignette');
      const angle = Math.PI / 5 * intensity;
      return `vignette=angle=${angle.toFixed(4)}`;
    }

    case 'temperature': {
      const val = sanitizeNumber(p.value, -1, 1, 0, 'temperature');
      if (val === 0) return null;
      // Warm: boost red, reduce blue. Cool: opposite.
      const rr = (1 + val * 0.3).toFixed(3);
      const bb = (1 - val * 0.3).toFixed(3);
      return `colorbalance=rs=${(val * 0.2).toFixed(3)}:bs=${(-val * 0.2).toFixed(3)}`;
    }

    case 'fade-in': {
      const duration = sanitizeNumber(p.duration, 0.1, 5, 1, 'fade-in');
      return `fade=in:st=0:d=${duration}`;
    }

    case 'fade-out': {
      // NOTE: fade-out needs the clip duration, which is injected as p.__clipDuration
      const duration = sanitizeNumber(p.duration, 0.1, 5, 1, 'fade-out');
      const clipDur = sanitizeNumber(p.__clipDuration, 0, 86400, 10, 'clipDuration');
      const startTime = Math.max(0, clipDur - duration);
      return `fade=out:st=${startTime.toFixed(3)}:d=${duration}`;
    }

    case 'color-balance': {
      const r = sanitizeNumber(p.r, -1, 1, 0, 'color-balance-r');
      const g = sanitizeNumber(p.g, -1, 1, 0, 'color-balance-g');
      const b = sanitizeNumber(p.b, -1, 1, 0, 'color-balance-b');
      if (r === 0 && g === 0 && b === 0) return null;
      return `colorbalance=rs=${r}:gs=${g}:bs=${b}`;
    }

    default:
      console.warn(`[FilterBuilder] Unknown filter type: ${filter.type}`);
      return null;
  }
}

/**
 * Combine multiple filter expressions into a single filtergraph chain.
 * Example: "eq=brightness=0.3,eq=contrast=1.2,boxblur=2:2"
 */
function buildFilterChain(filters) {
  const expressions = buildClipFilters(filters);
  return expressions.length > 0 ? expressions.join(',') : null;
}

module.exports = {
  buildClipFilters,
  mapFilterToFFmpeg,
  buildFilterChain,
};
