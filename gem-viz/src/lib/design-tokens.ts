/**
 * @module design-tokens
 * @description THE SINGLE SOURCE OF TRUTH FOR ALL COLORS AND DESIGN VALUES.
 *
 * Contains:
 * - UI colors (grays, feedback)
 * - Data visualization colors (trackers, statuses)
 * - Typography scales
 * - Spacing system
 * - Color manipulation utilities
 *
 * CSS custom properties in shared-styles.css mirror these values.
 *
 * @example
 * import { colors, getTrackerColor, withOpacity } from '$lib/design-tokens';
 * const coalColor = getTrackerColor('Coal Plant');
 * const faded = withOpacity(coalColor, 0.5);
 */

// =============================================================================
// 1. UI COLORS (Warm Neutrals)
// =============================================================================

export const colors = {
  // Core
  black: '#1a1a1a',
  white: '#fefefe',

  // Gray scale (stone-tinted for warmth)
  gray50: '#fafaf9',
  gray100: '#f5f5f4',
  gray200: '#e7e5e4',
  gray300: '#d6d3d1',
  gray400: '#a8a29e',
  gray500: '#78716c',
  gray600: '#57534e',
  gray700: '#44403c',
  gray800: '#292524',
  gray900: '#1c1917',

  // Semantic UI
  bgPrimary: '#fefefe',
  bgSecondary: '#fafaf9',
  bgTertiary: '#f5f5f4',

  textPrimary: '#1a1a1a',
  textSecondary: '#57534e',
  textTertiary: '#a8a29e',

  border: '#e7e5e4',
  borderDark: '#1a1a1a',
  borderLight: '#f5f5f4',

  // Feedback (muted, not garish)
  success: '#3d7a4a',
  successLight: '#dcfce7',
  warning: '#b45309',
  warningLight: '#fef3c7',
  error: '#b91c1c',
  errorLight: '#fee2e2',
  info: '#57534e',
  infoLight: '#f5f5f4',

  // Legacy aliases (for old code compatibility)
  navy: '#44403c',
  mint: '#e7e5e4',
  mintDataviz: '#d6d3d1',
  orange: '#78716c',
  teal: '#44403c',
  midnight: '#1c1917',
  warmWhite: '#fafaf9',
  deepRed: '#292524',
  yellow: '#d6d3d1',
  mintGreen: '#a8a29e',
  green: '#78716c',
  midnightGreen: '#44403c',
  blue: '#78716c',
  purple: '#a8a29e',
  midnightPurple: '#1a1a1a',
  grey: '#BECCCF',
  red: '#44403c',
} as const;

// =============================================================================
// 2. TRACKER COLORS (Data Visualization)
// =============================================================================

export const trackerColors: Record<string, string> = {
  // Fossil fuels (GEM brand colors)
  'Coal Plant': '#7F142A',
  'Coal Mine': '#4A0D19',
  'Gas Plant': '#A0AAE5',
  'Gas Pipeline': '#7B86C9',
  'Oil & NGL Pipeline': '#061F5F',
  'Iron Ore Mine': '#DC153D',
  'Steel Plant': '#004F61',
  'Cement and Concrete': '#BECCCF',
  'Bioenergy Power': '#51BF7E',

  // Renewables
  Nuclear: '#6B7280',
  Hydropower: '#0369A1',
  Wind: '#06B6D4',
  Geothermal: '#DC2626',
  Solar: '#EAB308',
};

// As Map for iteration
export const trackerColorMap = new Map(Object.entries(trackerColors));

// Renewable-only subset
export const renewableTrackerColors: Record<string, string> = {
  Nuclear: '#6B7280',
  Hydropower: '#0369A1',
  Wind: '#06B6D4',
  Geothermal: '#DC2626',
  Solar: '#EAB308',
};

export const renewableTrackerColorMap = new Map(Object.entries(renewableTrackerColors));

// =============================================================================
// 3. STATUS COLORS
// =============================================================================

// Aggregated status colors
export const statusColors: Record<string, string> = {
  operating: '#4A57A8',
  prospective: '#9CA3AF',
  retired: '#1F2937',
  cancelled: '#D1D5DB',
  unknown: '#E5E7EB',
};

// Granular status colors
export const statusColorsGranular: Record<string, string> = {
  // Operating
  operating: '#4A57A8',
  'operating pre-retirement': '#4A57A8',

  // Prospective (gradient from light to dark)
  proposed: '#FDE68A',
  announced: '#FCD34D',
  'pre-permit': '#F59E0B',
  permitted: '#F59E0B',
  'pre-construction': '#D97706',
  construction: '#D97706',

  // Retired
  retired: '#1F2937',
  mothballed: '#1F2937',
  idle: '#1F2937',
  'mothballed pre-retirement': '#1F2937',

  // Cancelled
  cancelled: '#D1D5DB',
  shelved: '#D1D5DB',
  'cancelled - inferred 4 y': '#D1D5DB',
  'shelved - inferred 2 y': '#D1D5DB',
};

// Status groupings
export const statusGroups = {
  operating: ['operating', 'operating pre-retirement'] as const,
  prospective: [
    'proposed',
    'announced',
    'pre-permit',
    'permitted',
    'pre-construction',
    'construction',
  ] as const,
  retired: ['retired', 'mothballed', 'idle', 'mothballed pre-retirement'] as const,
  cancelled: [
    'cancelled',
    'shelved',
    'cancelled - inferred 4 y',
    'shelved - inferred 2 y',
  ] as const,
} as const;

// Status color legend (for viz legends)
export const statusColorLegend = [
  { color: '#4A57A8', label: 'Operating', statuses: statusGroups.operating },
  { color: '#9CA3AF', label: 'Prospective', statuses: statusGroups.prospective },
  { color: '#1F2937', label: 'Retired', statuses: statusGroups.retired },
  { color: '#D1D5DB', label: 'Cancelled', statuses: statusGroups.cancelled },
];

// Prospective-only legend (more granular)
export const prospectiveColorLegend = [
  { color: '#FDE68A', label: 'Proposed/Announced', statuses: ['proposed', 'announced'] },
  {
    color: '#F59E0B',
    label: 'Pre-construction',
    statuses: ['pre-permit', 'permitted', 'pre-construction'],
  },
  { color: '#D97706', label: 'Construction', statuses: ['construction'] },
];

// =============================================================================
// 4. MAP COLORS
// =============================================================================

export const mapColors = {
  coal: '#1a1a1a',
  coalMine: '#4a4a4a',
  gas: '#e67e22',
  steel: '#8e44ad',
  iron: '#c0392b',
  bioenergy: '#27ae60',
  default: '#666666',
  selected: '#333333',
  unselected: '#999999',
  stroke: '#ffffff',
} as const;

export const trackerToMapColor: Record<string, string> = {
  'Coal Plant': mapColors.coal,
  'Coal Mine': mapColors.coalMine,
  'Gas Plant': mapColors.gas,
  'Steel Plant': mapColors.steel,
  'Iron Ore Mine': mapColors.iron,
  'Bioenergy Power': mapColors.bioenergy,
};

// =============================================================================
// 5. OWNERSHIP COLORS
// =============================================================================

export const ownershipColors = {
  direct: '#1a1a1a',
  indirect: '#666666',
  ultimate: '#333333',
  edge: '#999999',
  edgeHighlight: '#333333',
} as const;

// =============================================================================
// 6. TYPOGRAPHY
// =============================================================================

export const fonts = {
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
  sans: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
} as const;

export const fontSizes = {
  xs: '8px',
  sm: '9px',
  base: '10px',
  md: '11px',
  body: '12px',
  lg: '14px',
  xl: '17px',
  '2xl': '20px',
  '3xl': '24px',
} as const;

// =============================================================================
// 7. SPACING
// =============================================================================

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

// =============================================================================
// 8. COLOR UTILITIES
// =============================================================================

/**
 * Get color for a tracker type
 */
export function getTrackerColor(tracker: string): string {
  return trackerColors[tracker] || colors.gray500;
}

/**
 * Get color for a status (granular)
 */
export function getStatusColor(status: string | undefined): string {
  if (!status) return statusColors.unknown;
  const normalized = status.toLowerCase();
  return statusColorsGranular[normalized] || statusColors.unknown;
}

/**
 * Get aggregated status color
 */
export function getAggregatedStatusColor(status: string | undefined): string {
  const group = getStatusGroup(status);
  return statusColors[group];
}

/**
 * Get aggregated status category
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
 * Regroup status into 4 categories
 */
export function regroupStatus(status: string | undefined): string {
  return getStatusGroup(status);
}

/**
 * Convert hex to RGB object
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
 * Convert RGB to hex
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
 * Convert RGB to HSL
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
 * Convert HSL to RGB
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

/**
 * Set absolute lightness of a color
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
 * Adjust lightness by percentage
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
 * Lighten or darken a color
 * @param percent - Positive to lighten, negative to darken
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
 * Get a color with opacity as rgba string
 */
export function withOpacity(hex: string, opacity: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

// =============================================================================
// 9. LEGACY EXPORTS (for backward compatibility)
// =============================================================================

// Maps for legacy code that expects Map objects
export const colorByTracker = trackerColorMap;
export const colorByTrackerRenewable = renewableTrackerColorMap;
export const colorByStatus = new Map(Object.entries(statusColorsGranular));

// Prospective status colors as Map (legacy format)
export const statusColorsProspective = new Map([
  ['#FDE68A', { descript: 'proposed/announced', statuses: ['proposed', 'announced'] }],
  [
    '#F59E0B',
    { descript: 'pre-construction', statuses: ['pre-permit', 'permitted', 'pre-construction'] },
  ],
  ['#D97706', { descript: 'construction', statuses: ['construction'] }],
]);

export const colorByStatusProspective = new Map(
  Array.from(statusColorsProspective).flatMap(([color, { statuses }]) =>
    statuses.map((status) => [status, color])
  )
);

// Aggregated status colors as Map (legacy format)
export const statusColorsMap = new Map([
  ['#4A57A8', { descript: 'operating', statuses: statusGroups.operating }],
  ['#9CA3AF', { descript: 'prospective', statuses: statusGroups.prospective }],
  ['#1F2937', { descript: 'retired/mothballed/idle', statuses: statusGroups.retired }],
  ['#D1D5DB', { descript: 'cancelled/shelved', statuses: statusGroups.cancelled }],
]);

// =============================================================================
// 10. STATUS/TRACKER LISTS
// =============================================================================

export const fossilTrackers = ['Coal Plant', 'Gas Plant', 'Coal Mine', 'Gas Pipeline'];

export const prospectiveStatuses = [
  'permitted',
  'pre-permit',
  'pre-construction',
  'construction',
  'proposed',
  'announced',
];

// =============================================================================
// AGGREGATED EXPORTS (for legacy imports from ownership-theme)
// =============================================================================

export const colMaps = {
  byTracker: colorByTracker,
  byStatus: colorByStatus,
  byStatusProspective: colorByStatusProspective,
  statusLegend: statusColorsMap,
  statusProspectiveLegend: statusColorsProspective,
};
