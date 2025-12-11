/**
 * GEM Ownership Tools - Theme & Colors
 * Ported from Observable notebook: eab9bd6720b8c130 (Ownership Tools - Styles)
 */

// Core brand colors (from GEM brand guidelines)
export const colors = {
  // Primary
  navy: '#004A63',
  mint: '#9DF7E5',
  mintDataviz: '#A5E9E4',
  orange: '#FE4F2D',
  teal: '#016B83',
  midnight: '#002430',
  warmWhite: '#F2F2EB',
  white: '#FFFFFF',
  // Secondary
  deepRed: '#7F142A',
  yellow: '#FFE366',
  mintGreen: '#95E6AF',
  green: '#51BF7E',
  midnightGreen: '#004F61',
  blue: '#099ED8',
  purple: '#A0AAE5',
  midnightPurple: '#061F5F',
  grey: '#BECCCF',
  // Legacy (for compatibility)
  red: '#DC153D',
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

// Color by tracker type (from GEM brand guidelines)
export const colorByTracker = new Map([
  ['Coal Plant', colors.deepRed],
  ['Coal Mine', '#CA4A50'], // Slightly lighter than deepRed
  ['Gas Plant', colors.purple],
  ['Gas Pipeline', '#4A57A8'], // Between purple and midnightPurple
  ['Oil & NGL Pipeline', colors.midnightPurple],
  ['Iron Ore Mine', '#FF6A4D'], // Slightly lighter than orange
  ['Steel Plant', colors.midnightGreen],
  ['Cement and Concrete', colors.grey],
  ['Bioenergy Power', colors.green],
]);

// Renewable tracker colors
export const colorByTrackerRenewable = new Map([
  ['Nuclear', colors.mintGreen],
  ['Hydropower', colors.blue],
  ['Wind', colors.mintDataviz],
  ['Geothermal', '#FF380F'],
  ['Solar', colors.yellow],
]);

// Status color groupings (from GEM brand guidelines)
export const statusColors = new Map([
  [
    colors.purple, // Prospective
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
    '#4A57A8', // Operating (between purple and midnightPurple)
    {
      descript: 'operating',
      statuses: ['operating', 'operating pre-retirement'],
    },
  ],
  [
    colors.midnightPurple, // Retired
    {
      descript: 'retired/mothballed/idle',
      statuses: ['retired', 'mothballed', 'idle', 'mothballed pre-retirement'],
    },
  ],
  [
    colors.grey, // Cancelled
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
