/**
 * SimpleMap configuration
 * Extracted from SimpleMap.svelte to reduce file size
 */

import chroma from 'chroma-js';
import { trackerToMapColor } from '$lib/design-tokens';

// Layer visibility toggles - group similar trackers together
export const trackerGroups: Record<string, string[]> = {
  coal: ['Coal Plant', 'Coal Mine'],
  gas: ['Gas Plant', 'Gas Pipeline', 'Oil & NGL Pipeline'],
  steel: ['Steel Plant', 'Iron Mine', 'Iron Ore Mine'],
  bioenergy: ['Bioenergy Power', 'Cement and Concrete'],
};

// Tracker color stops for MapLibre match expressions
// Usage: ['match', ['get', 'tracker'], ...trackerColorStops, fallback]
export const trackerColorStops: string[] = Object.entries(trackerToMapColor).flat();

// Glow color stops with desaturation for better readability
// Usage: ['match', ['get', 'tracker'], ...trackerGlowColorStops, fallback]
export const trackerGlowColorStops: string[] = Object.entries(trackerToMapColor).flatMap(
  ([tracker, color]) => [tracker, chroma(color).desaturate(2).brighten(0.8).hex()]
);

// GEM Core Palette
export const palette = {
  navy: '#004A63',
  mintDataviz: '#A5E9E4',
  orange: '#FE4F2D',
  teal: '#016B83',
  midnight: '#002430',
  warmWhite: '#F2F2EB',
  white: '#FFFFFF',
};

// Theme colors using core palette
export const themes = {
  dark: {
    background: palette.midnight,
    land: '#0a1a20',
    landStroke: palette.navy,
    ocean: palette.midnight,
    text: palette.mintDataviz,
    textMuted: '#7FA4B1', // navy-50
    accent: palette.orange,
    panel: 'rgba(0, 36, 48, 0.9)',
    panelBorder: palette.teal,
    glow: palette.mintDataviz,
    statColor: palette.mintDataviz,
    capacityColor: palette.orange,
  },
  light: {
    background: palette.warmWhite,
    land: palette.white,
    landStroke: '#BFDAE0', // navy-25
    ocean: palette.warmWhite,
    text: palette.midnight,
    textMuted: palette.navy,
    accent: palette.orange,
    panel: 'rgba(255, 255, 255, 0.94)',
    panelBorder: palette.navy,
    glow: palette.teal,
    statColor: palette.navy,
    capacityColor: palette.orange,
  },
};

export type Theme = typeof themes.light;

// Default map config
export const defaultMapConfig = {
  center: [20, 15] as [number, number],
  zoom: 2.35,
  maxPitch: 0,
  bearing: 0,
  minZoom: 1.5,
  maxZoom: 16,
};

// Tooltip minimum zoom level
export const TOOLTIP_MIN_ZOOM = 3;

// Spin control speed
export const SPIN_SPEED = 0.12;

// External data sources
export const DATA_SOURCES = {
  countriesGeoJson: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};
