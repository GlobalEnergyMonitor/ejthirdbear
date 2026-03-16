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
// 1. GEM BRAND COLORS
// =============================================================================

export const colors = {
  // --- GEM Core Brand ---
  primaryBlue: '#1D4961', // Primary text/UI color
  navy: '#1D4961', // Aliased to primary blue
  mint: '#9DF7E5',
  mintDataviz: '#A5E9E4', // Slightly muted for charts
  orange: '#FE4F2D',
  teal: '#1D4961', // Aliased to primary blue
  midnight: '#1D4961', // Aliased to primary blue
  warmWhite: '#FFFFFE', // Near-white from mocks
  white: '#FFFFFF',

  // --- GEM Secondary Palette (Nadieh Bremer) ---
  deepRed: '#7F142A',
  redLight: '#CA4A50',
  yellow: '#FFE366',
  mintGreen: '#95E6AF',
  green: '#51BF7E',
  midnightGreen: '#004F61',
  blue: '#099ED8',
  purple: '#A0AAE5',
  midnightPurple: '#061F5F',
  grey: '#BECCCF',

  // --- Neutrals (derived from brand) ---
  black: '#1D4961', // Use primary blue as black
  gray50: '#F2F2EB', // warmWhite
  gray100: '#ECEAE3',
  gray200: '#dce3e5',
  gray300: '#BECCCF',
  gray400: '#9EAAAD',
  gray500: '#6e8c91',
  gray600: '#4c6267',
  gray700: '#3a4d51',
  gray800: '#1C1F23',
  gray900: '#1D4961', // primary blue

  // --- Semantic UI ---
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F2F2EB',
  bgTertiary: '#ECEAE3',

  textPrimary: '#1D4961',
  textSecondary: '#4c6267',
  textTertiary: '#9EAAAD',

  border: '#dce3e5',
  borderDark: '#1D4961',
  borderLight: '#ECEAE3',

  // --- Feedback ---
  success: '#51BF7E',
  successLight: '#95E6AF',
  warning: '#FE4F2D',
  warningLight: '#FED3CA',
  error: '#7F142A',
  errorLight: '#f4b7b3',
  info: '#1D4961',
  infoLight: '#E9EEF1',
} as const;

// =============================================================================
// 2. TRACKER COLORS (Data Visualization)
// From Nadieh Bremer's Ownership Interface - Condensed palette
// =============================================================================

export const trackerColors: Record<string, string> = {
  // Coal (Deep Red)
  'Coal Plant': '#7F142A',
  'Coal Mine': '#7F142A',

  // Oil & Gas (Lighter Red)
  'Gas Plant': '#CA4A50',
  'Oil & Gas Plant': '#CA4A50',
  'Gas Pipeline': '#CA4A50',
  'Natural Gas Transmission Pipeline': '#CA4A50',
  'Oil & NGL Pipeline': '#CA4A50',
  'Oil or NGL Pipeline': '#CA4A50',
  'Oil Pipeline': '#CA4A50',

  // Cement (Grey-Teal)
  'Cement and Concrete': '#6e8c91',
  'Cement or Concrete Plant': '#6e8c91',
  'Cement Plant': '#6e8c91',

  // Bioenergy (Purple)
  'Bioenergy Power': '#A0AAE5',
  'Bioenergy Plant': '#A0AAE5',

  // Geothermal (Deep Teal)
  Geothermal: '#004F61',

  // Iron & Steel (Midnight Green)
  'Iron Mine': '#004F61',
  'Iron Ore Mine': '#004F61',
  'Steel Plant': '#004F61',
  'Iron & Steel Plant': '#004F61',

  // Renewables (from Global Integrated Power Tracker spec)
  Solar: '#FFE366',
  Wind: '#51BF7E',
  Hydropower: '#099ED8',
  Nuclear: '#4A57A8',
};

// As Map for iteration
export const trackerColorMap = new Map(Object.entries(trackerColors));

// Renewable-only subset (from Global Integrated Power Tracker spec)
export const renewableTrackerColors: Record<string, string> = {
  Solar: '#FFE366',
  Wind: '#51BF7E',
  Hydropower: '#099ED8',
  Nuclear: '#4A57A8',
  Geothermal: '#004F61',
};

export const renewableTrackerColorMap = new Map(Object.entries(renewableTrackerColors));

// =============================================================================
// 3. STATUS COLORS
// Fossil uses red scale, Renewables use green scale
// =============================================================================

// Aggregated status colors (for fossil/dirty assets)
export const statusColors: Record<string, string> = {
  operating: '#7F142A', // Deep red - active fossil
  planned: '#CA4A50', // Lighter red - planned fossil
  retired: '#6e8c91', // Grey-teal - shut down
  cancelled: '#dce3e5', // Light grey - never built
  unknown: '#BECCCF',
};

// Granular status colors
export const statusColorsGranular: Record<string, string> = {
  // Operating (fossil = red)
  operating: '#7F142A',
  'operating pre-retirement': '#7F142A',

  // Planned (gradient from light to dark red)
  planned: '#CA4A50', // aggregate status from API
  proposed: '#f4b7b3',
  announced: '#f4b7b3',
  'pre-permit': '#CA4A50',
  permitted: '#CA4A50',
  'pre-construction': '#CA4A50',
  construction: '#7F142A',

  // Retired (grey-teal)
  retired: '#6e8c91',
  mothballed: '#6e8c91',
  idle: '#6e8c91',
  'mothballed pre-retirement': '#6e8c91',

  // Cancelled (light grey)
  cancelled: '#dce3e5',
  shelved: '#BECCCF',
  'cancelled - inferred 4 y': '#dce3e5',
  'shelved - inferred 2 y': '#BECCCF',
};

// Status groupings
export const statusGroups = {
  operating: ['operating', 'operating pre-retirement'] as const,
  planned: [
    'proposed',
    'announced',
    'pre-permit',
    'permitted',
    'pre-construction',
    'construction',
    // TODO: remove once pipeline is fixed — API currently returns aggregate 'planned'
    // instead of granular sub-statuses for some trackers (e.g. Gas Plants)
    'planned',
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
  { color: '#7F142A', label: 'Operating', statuses: statusGroups.operating },
  { color: '#CA4A50', label: 'Planned', statuses: statusGroups.planned },
  { color: '#6e8c91', label: 'Retired', statuses: statusGroups.retired },
  { color: '#dce3e5', label: 'Cancelled', statuses: statusGroups.cancelled },
];

// Planned-only legend (more granular)
export const prospectiveColorLegend = [
  { color: '#f4b7b3', label: 'Proposed/Announced', statuses: ['proposed', 'announced'] },
  {
    color: '#CA4A50',
    label: 'Pre-construction',
    statuses: ['pre-permit', 'permitted', 'pre-construction'],
  },
  { color: '#7F142A', label: 'Construction', statuses: ['construction'] },
];

// =============================================================================
// 4. MAP COLORS
// =============================================================================

export const mapColors = {
  // Tracker-specific
  coal: '#7F142A', // Deep red
  coalMine: '#7F142A',
  gas: '#CA4A50', // Lighter red
  steel: '#004F61', // Midnight green
  iron: '#004F61',
  cement: '#6e8c91', // Grey-teal
  bioenergy: '#A0AAE5', // Purple

  // Renewables
  solar: '#FFE366',
  wind: '#51BF7E',
  hydro: '#099ED8',

  // UI states
  default: '#1D4961', // Primary blue
  selected: '#FE4F2D', // GEM orange
  unselected: '#BECCCF', // Grey
  stroke: '#FFFFFF',
} as const;

export const trackerToMapColor: Record<string, string> = {
  'Coal Plant': mapColors.coal,
  'Coal Mine': mapColors.coalMine,
  'Gas Plant': mapColors.gas,
  'Gas Pipeline': mapColors.gas,
  'Oil & NGL Pipeline': mapColors.gas,
  'Steel Plant': mapColors.steel,
  'Iron Mine': mapColors.iron,
  'Iron Ore Mine': mapColors.iron,
  'Cement and Concrete': mapColors.cement,
  'Bioenergy Power': mapColors.bioenergy,
  Solar: mapColors.solar,
  Wind: mapColors.wind,
  Hydropower: mapColors.hydro,
};

// =============================================================================
// 5. OWNERSHIP COLORS
// =============================================================================

export const ownershipColors = {
  direct: '#1D4961', // Primary blue
  indirect: '#1D4961', // Primary blue
  ultimate: '#1D4961', // Primary blue
  edge: '#BECCCF', // Grey
  edgeHighlight: '#FE4F2D', // Orange

  // --- Tree graph palette (converged from Observable to GEM brand) ---
  treeNavy: '#1D4961', // Labels, text — was #004A63
  treeTeal: '#004F61', // Asset fills, accents — midnightGreen
  treeMint: '#9DF7E5', // Hover highlights
  treeWarmWhite: '#F2F2EB', // Panel backgrounds — gray50
  treeNodeFill: '#BECCCF', // Default entity node fill — grey
  treeEdge: '#A5E9E4', // Edge lines — mintDataviz
  treeEdgeImputed: '#dce3e5', // Imputed/estimated edges — gray200
  treeMidnight: '#1C1F23', // Dark tooltip bg — gray800

  // --- Entity type colors (ownership graph categories) ---
  entityGovernment: '#A0AAE5', // purple
  entityGovernmentDark: '#061F5F', // midnightPurple
  entityGovernmentLight: '#d0d5f2',
  entityPublicCorp: '#099ED8', // blue
  entityPublicCorpDark: '#1D4961', // navy
  entityPublicCorpLight: '#84cfec',
  entityPrivate: '#51BF7E', // green
  entityPrivateDark: '#1D4961', // navy
  entityPrivateLight: '#95E6AF', // mintGreen
  entityOther: '#BECCCF', // grey
  entityOtherDark: '#3a4d51', // gray700
  entityOtherLight: '#dce3e5', // gray200
} as const;

// =============================================================================
// 6. TYPOGRAPHY - GEM Type Hierarchy
// Plus Jakarta Sans for UI, Barlow Semi-Condensed for Data/Stats (UPPERCASE)
// =============================================================================

export const fonts = {
  // Plus Jakarta Sans - Headlines, Body, Buttons, UI
  sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  // Barlow Semi-Condensed - Data/Numbers/Stats (UPPERCASE)
  data: "'Barlow Semi-Condensed', 'Arial Narrow', sans-serif",
  mono: "'Barlow Semi-Condensed', 'Arial Narrow', sans-serif" /* Use Barlow Semi-Condensed instead of monospace */,
} as const;

export const fontSizes = {
  xs: '10px', // Annotations, footnotes (uppercase)
  sm: '12px', // Tables, small text
  base: '14px', // Body text
  md: '16px', // Large body / small sublines
  lg: '18px', // Sublines
  xl: '24px', // Section headers
  '2xl': '32px', // Page titles
  '3xl': '40px', // Large headlines
  '4xl': '56px', // Hero headlines
  '5xl': '72px', // Display headlines
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeights = {
  none: 1,
  tight: 1.1,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.65,
} as const;

export const letterSpacing = {
  tighter: '-0.02em',
  tight: '-0.01em',
  normal: '0',
  wide: '0.02em',
  wider: '0.04em',
  widest: '0.08em',
} as const;

// Typography presets for easy use
export const typography = {
  // Headlines (Plus Jakarta Sans Bold)
  headlineDisplay: {
    fontFamily: fonts.display,
    fontSize: fontSizes['5xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  headlineHero: {
    fontFamily: fonts.display,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacing.tight,
  },
  headline1: {
    fontFamily: fonts.display,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacing.tight,
  },
  headline2: {
    fontFamily: fonts.display,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.snug,
  },
  headline3: {
    fontFamily: fonts.display,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.snug,
  },

  // Sublines (Plus Jakarta Sans Bold, smaller)
  subline1: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.normal,
  },
  subline2: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.normal,
  },

  // Body (Plus Jakarta Sans Regular)
  bodyLg: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.relaxed,
  },
  bodyBase: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.relaxed,
  },
  bodySm: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.normal,
  },

  // Buttons (Plus Jakarta Sans Bold)
  button: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
  },

  // Emphasis (Plus Jakarta Sans Bold Uppercase)
  emphasis: {
    fontFamily: fonts.sans,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wider,
  },

  // Data (Barlow Semi-Condensed - UPPERCASE)
  dataDisplay: {
    fontFamily: fonts.data,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
  },
  dataLarge: {
    fontFamily: fonts.data,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
  },
  dataMedium: {
    fontFamily: fonts.data,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
  },
  dataSmall: {
    fontFamily: fonts.data,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
  },

  // Tables & Annotations
  table: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.normal,
  },
  annotation: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.widest,
  },
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
export function getTrackerColor(tracker: string | undefined | null): string {
  if (!tracker) return colors.gray500;
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
  ['#f4b7b3', { descript: 'proposed/announced', statuses: ['proposed', 'announced'] }],
  [
    '#CA4A50',
    { descript: 'pre-construction', statuses: ['pre-permit', 'permitted', 'pre-construction'] },
  ],
  ['#7F142A', { descript: 'construction', statuses: ['construction'] }],
]);

export const colorByStatusProspective = new Map(
  Array.from(statusColorsProspective).flatMap(([color, { statuses }]) =>
    statuses.map((status) => [status, color])
  )
);

// Aggregated status colors as Map (legacy format)
export const statusColorsMap = new Map([
  ['#7F142A', { descript: 'operating', statuses: statusGroups.operating }],
  ['#CA4A50', { descript: 'planned', statuses: statusGroups.planned }],
  ['#6e8c91', { descript: 'retired/mothballed/idle', statuses: statusGroups.retired }],
  ['#dce3e5', { descript: 'cancelled/shelved', statuses: statusGroups.cancelled }],
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
  // TODO: remove once pipeline is fixed
  'planned',
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
