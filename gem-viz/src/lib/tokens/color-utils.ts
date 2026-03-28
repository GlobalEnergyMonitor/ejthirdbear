/**
 * @module tokens/color-utils
 * Color manipulation utilities: hex/rgb/hsl conversions, opacity, lightness,
 * and tracker/status color lookups.
 */

import { colors, trackerColors, statusColors, statusColorsGranular, statusGroups } from './colors';

// =============================================================================
// COLOR LOOKUPS
// =============================================================================

/**
 * Get color for a tracker type.
 */
export function getTrackerColor(tracker: string | undefined | null): string {
  if (!tracker) return colors.gray500;
  return trackerColors[tracker] || colors.gray500;
}

/**
 * Get color for a status (granular).
 */
export function getStatusColor(status: string | undefined): string {
  if (!status) return statusColors.unknown;
  const normalized = status.toLowerCase();
  return statusColorsGranular[normalized] || statusColors.unknown;
}

/**
 * Get aggregated status color.
 */
export function getAggregatedStatusColor(status: string | undefined): string {
  const group = getStatusGroup(status);
  return statusColors[group];
}

/**
 * Get aggregated status category.
 */
export function getStatusGroup(status: string | undefined): keyof typeof statusColors {
  if (!status) return 'unknown';
  const normalized = status.toLowerCase();

  for (const [group, statuses] of Object.entries(statusGroups)) {
    if ((statuses as readonly string[]).includes(normalized)) {
      return group as keyof typeof statusColors;
    }
  }
  return 'unknown';
}

/**
 * Regroup status into 4 categories.
 */
export function regroupStatus(status: string | undefined): string {
  return getStatusGroup(status);
}

// =============================================================================
// HEX / RGB / HSL CONVERSIONS
// =============================================================================

/**
 * Convert hex to RGB object.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) =>
        Math.round(Math.max(0, Math.min(255, x)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

/**
 * Convert RGB to HSL.
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h, s, l };
}

/**
 * Convert HSL to RGB.
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

// =============================================================================
// LIGHTNESS / OPACITY ADJUSTMENTS
// =============================================================================

/**
 * Set absolute lightness of a color.
 */
export function setColLightness(col: string, lightness: number): string {
  const rgb = hexToRgb(col);
  if (!rgb) return col;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = lightness;
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

/**
 * Adjust lightness by percentage.
 */
export function adjustColLightness(col: string, pct: number): string {
  const rgb = hexToRgb(col);
  if (!rgb) return col;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = Math.max(0, Math.min(1, hsl.l * pct));
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

/**
 * Lighten or darken a color.
 * @param percent - Positive to lighten, negative to darken.
 */
export function adjustColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const adjust = (c: number) => {
    if (percent > 0) {
      return c + (255 - c) * percent;
    } else {
      return c * (1 + percent);
    }
  };

  return rgbToHex(adjust(rgb.r), adjust(rgb.g), adjust(rgb.b));
}

/**
 * Get a color with opacity as rgba string.
 */
export function withOpacity(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}
