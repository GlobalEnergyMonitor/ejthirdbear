/**
 * GEM Ownership Tools - Theme & Colors
 * Ported from Observable notebook: eab9bd6720b8c130 (Ownership Tools - Styles)
 */

// Core brand colors - MONOCHROME PALETTE
// "Get it right in black and white!" - Curran
export const colors = {
  // Primary - Monochrome
  navy: '#333333', // Was #004A63 - now dark grey
  mint: '#e0e0e0', // Was #9DF7E5 - now light grey
  mintDataviz: '#d0d0d0', // Was #A5E9E4 - now light grey
  orange: '#666666', // Was #FE4F2D - now medium grey
  teal: '#444444', // Was #016B83 - now dark grey
  midnight: '#111111', // Was #002430 - now near black
  warmWhite: '#F5F5F5', // Slightly off-white
  white: '#FFFFFF',
  // Secondary - Monochrome
  deepRed: '#222222', // Was #7F142A - now very dark grey
  yellow: '#cccccc', // Was #FFE366 - now light grey
  mintGreen: '#aaaaaa', // Was #95E6AF - now medium grey
  green: '#888888', // Was #51BF7E - now medium grey
  midnightGreen: '#333333', // Was #004F61 - now dark grey
  blue: '#777777', // Was #099ED8 - now medium grey
  purple: '#999999', // Was #A0AAE5 - now medium grey
  midnightPurple: '#000000', // Was #061F5F - now black
  grey: '#BECCCF', // Keep as-is (already grey)
  // Legacy (for compatibility)
  red: '#444444', // Was #DC153D - now dark grey
  black: '#000000',
} as const;

// Color manipulation utilities
export function setColLightness(col: string, lightness: number): string {
  // Convert hex to HSL, set lightness, return hex
  const rgb = hexToRgb(col);
  if (!rgb) return col;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = lightness;
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

export function adjustColLightness(col: string, pct: number): string {
  const rgb = hexToRgb(col);
  if (!rgb) return col;

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  hsl.l = Math.max(0, Math.min(1, hsl.l * pct));
  const newRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

// Color by tracker type - RESTORED COLORS for viz components
// Nadieh-style flower visualizations need distinct colors
export const colorByTracker = new Map([
  ['Coal Plant', '#7F142A'], // Deep red (coal)
  ['Coal Mine', '#4A0D19'], // Darker red
  ['Gas Plant', '#A0AAE5'], // Purple
  ['Gas Pipeline', '#7B86C9'], // Darker purple
  ['Oil & NGL Pipeline', '#061F5F'], // Midnight blue
  ['Iron Ore Mine', '#DC153D'], // Red
  ['Steel Plant', '#004F61'], // Teal
  ['Cement and Concrete', '#BECCCF'], // Grey
  ['Bioenergy Power', '#51BF7E'], // Green
]);

// Renewable tracker colors - MONOCHROME
export const colorByTrackerRenewable = new Map([
  ['Nuclear', '#888888'], // Medium grey (was mintGreen)
  ['Hydropower', '#666666'], // Medium grey (was blue)
  ['Wind', '#aaaaaa'], // Light grey (was mintDataviz)
  ['Geothermal', '#333333'], // Dark grey (was red)
  ['Solar', '#cccccc'], // Very light grey (was yellow)
]);

// Status color groupings - MONOCHROME
export const statusColors = new Map([
  [
    '#888888', // Prospective - medium grey (was purple)
    {
      descript: 'prospective',
      statuses: [
        'proposed',
        'announced',
        'pre-permit',
        'permitted',
        'pre-construction',
        'construction',
      ],
    },
  ],
  [
    '#333333', // Operating - dark grey (was blue)
    {
      descript: 'operating',
      statuses: ['operating', 'operating pre-retirement'],
    },
  ],
  [
    '#000000', // Retired - black (was midnightPurple)
    {
      descript: 'retired/mothballed/idle',
      statuses: ['retired', 'mothballed', 'idle', 'mothballed pre-retirement'],
    },
  ],
  [
    '#bbbbbb', // Cancelled - light grey (was grey)
    {
      descript: 'cancelled/shelved',
      statuses: ['cancelled', 'shelved', 'cancelled - inferred 4 y', 'shelved - inferred 2 y'],
    },
  ],
]);

// Flat map: status -> color
export const colorByStatus = new Map(
  Array.from(statusColors).flatMap(([color, { statuses }]) =>
    statuses.map((status) => [status, color])
  )
);

// Prospective-only status colors (more granular)
export const statusColorsProspective = new Map([
  [
    setColLightness(colors.orange, 0.8),
    {
      descript: 'proposed/announced',
      statuses: ['proposed', 'announced'],
    },
  ],
  [
    colors.orange,
    {
      descript: 'pre-construction',
      statuses: ['pre-permit', 'permitted', 'pre-construction'],
    },
  ],
  [
    setColLightness(colors.orange, 0.3),
    {
      descript: 'construction',
      statuses: ['construction'],
    },
  ],
]);

export const colorByStatusProspective = new Map(
  Array.from(statusColorsProspective).flatMap(([color, { statuses }]) =>
    statuses.map((status) => [status, color])
  )
);

// Fossil fuel trackers
export const fossilTrackers = ['Coal Plant', 'Gas Plant', 'Coal Mine', 'Gas Pipeline'];

// Prospective statuses
export const prospectiveStatuses = [
  'permitted',
  'pre-permit',
  'pre-construction',
  'construction',
  'proposed',
  'announced',
];

// ID field mapping by tracker type
export const idFields = new Map([
  ['Bioenergy Power', 'GEM unit ID'],
  ['Coal Plant', 'GEM unit ID'],
  ['Gas Plant', 'GEM unit ID'],
  ['Coal Mine', 'GEM Mine ID'],
  ['Iron Ore Mine', 'GEM Asset ID'],
  ['Gas Pipeline', 'ProjectID'],
  ['Oil & NGL Pipeline', 'ProjectID'],
  ['Steel Plant', 'Steel Plant ID'],
  ['Cement and Concrete', 'GEM Plant ID'],
]);

// Capacity field mapping by tracker type
export const capacityFields = new Map([
  ['Bioenergy Power', 'Capacity (MW)'],
  ['Coal Plant', 'Capacity (MW)'],
  ['Gas Plant', 'Capacity (MW)'],
  ['Coal Mine', 'Capacity (Mtpa)'],
  ['Iron Ore Mine', 'Production 2023 (ttpa)'],
  ['Gas Infrastructure', 'CapacityBcm/y'],
  ['Oil Infrastructure', 'CapacityBOEd'],
  ['Steel Plant', 'Nominal crude steel capacity (ttpa)'],
  ['Cement and Concrete', 'Cement Capacity (millions metric tonnes per annum)'],
]);

// Helper: hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Helper: RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

// Helper: RGB to HSL
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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

// Helper: HSL to RGB
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
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

// Regroup status into 4 categories (from Observable notebook)
export function regroupStatus(status: string | undefined): string {
  const s = status?.toLowerCase();
  if (['operating', 'operating pre-retirement'].includes(s || '')) return 'operating';
  if (
    [
      'proposed',
      'announced',
      'pre-permit',
      'permitted',
      'pre-construction',
      'construction',
    ].includes(s || '')
  )
    return 'proposed';
  if (['retired', 'mothballed', 'idle', 'mothballed pre-retirement'].includes(s || ''))
    return 'retired';
  if (
    ['cancelled', 'shelved', 'cancelled - inferred 4 y', 'shelved - inferred 2 y'].includes(s || '')
  )
    return 'cancelled';
  return 'unknown';
}

// Aggregated color maps for export
export const colMaps = {
  byTracker: colorByTracker,
  byStatus: colorByStatus,
  byStatusProspective: colorByStatusProspective,
  statusLegend: statusColors,
  statusProspectiveLegend: statusColorsProspective,
};
