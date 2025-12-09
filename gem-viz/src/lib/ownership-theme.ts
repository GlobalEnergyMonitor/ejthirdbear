/**
 * GEM Ownership Tools - Theme & Colors
 * Ported from Observable notebook: 088dde385b864f12
 */

// Core brand colors
export const colors = {
  navy: '#004A63',
  mint: '#9DF7E5',
  orange: '#FE4F2D',
  teal: '#016B83',
  midnight: '#002430',
  warmWhite: '#F2F2EB',
  white: '#FFFFFF',
  red: '#DC153D',
  yellow: '#F4CA19',
  green: '#32B24D',
  purple: '#89549D',
  black: '#000000',
  grey: '#808080',
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

// Color by tracker type
export const colorByTracker = new Map([
  ['Coal Plant', setColLightness(colors.orange, 0.2)],
  ['Coal Mine', setColLightness(colors.orange, 0.35)],
  ['Gas Plant', colors.orange],
  ['Oil & NGL Pipeline', setColLightness(colors.yellow, 0.4)],
  ['Gas Pipeline', setColLightness(colors.orange, 0.75)],
  ['Bioenergy Power', setColLightness(colors.purple, 0.4)],
  ['Steel Plant', setColLightness(colors.purple, 0.65)],
  ['Iron Ore Mine', colors.red],
  ['Cement and Concrete', setColLightness(colors.yellow, 0.2)],
]);

// Status color groupings
export const statusColors = new Map([
  [
    setColLightness(colors.orange, 0.2),
    {
      descript: 'operating',
      statuses: ['operating', 'operating pre-retirement'],
    },
  ],
  [
    colors.orange,
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
    setColLightness(colors.grey, 0.4),
    {
      descript: 'retired/mothballed/idle',
      statuses: ['retired', 'mothballed', 'idle', 'mothballed pre-retirement'],
    },
  ],
  [
    setColLightness(colors.grey, 0.7),
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
