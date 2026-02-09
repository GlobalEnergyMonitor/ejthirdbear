/**
 * NetworkGraph configuration
 * Extracted from NetworkGraph.svelte to reduce file size
 */

import { hexToRgb } from '$lib/design-tokens';

export interface SimulationPreset {
  alphaDecay: number;
  velocityDecay: number;
  chargeStrength: number;
  linkDistance: number;
  linkStrength: number;
  centerStrength: number;
  axisStrength: number;
  warmupTicks: number;
  animTicks: number;
}

// Presets optimized for d3-force-3d
export const SIMULATION_PRESETS: Record<string, SimulationPreset> = {
  fast: {
    alphaDecay: 0.06,
    velocityDecay: 0.5,
    chargeStrength: -18,
    linkDistance: 40,
    linkStrength: 0.4,
    centerStrength: 0.6,
    axisStrength: 0.01,
    warmupTicks: 80,
    animTicks: 60,
  },
  medium: {
    alphaDecay: 0.04,
    velocityDecay: 0.4,
    chargeStrength: -30,
    linkDistance: 55,
    linkStrength: 0.35,
    centerStrength: 0.5,
    axisStrength: 0.008,
    warmupTicks: 120,
    animTicks: 100,
  },
  slow: {
    alphaDecay: 0.02,
    velocityDecay: 0.3,
    chargeStrength: -45,
    linkDistance: 70,
    linkStrength: 0.3,
    centerStrength: 0.4,
    axisStrength: 0.006,
    warmupTicks: 180,
    animTicks: 150,
  },
};

export const LAYOUT_TUNING = {
  linkDistance: { short: 0.9, medium: 1.1, long: 1.5 },
  repulsion: { low: 0.9, medium: 1.1, high: 1.6 },
  gravity: { low: 0.35, medium: 0.9, high: 1.3 },
} as const;

export interface NetworkConfig {
  maxEdges: number;
  minConnections: number;
  edgeOpacity: number;
  sampleMode: 'top' | 'random' | 'connected';
  simulationSpeed: 'fast' | 'medium' | 'slow';
  warmupTicks: number;
  use3D: boolean;
  autoRotate: boolean;
  rotationSpeed: number;
  linkDistance: 'short' | 'medium' | 'long';
  repulsion: 'low' | 'medium' | 'high';
  gravity: 'low' | 'medium' | 'high';
}

export const DEFAULT_CONFIG: NetworkConfig = {
  maxEdges: 50000,
  minConnections: 2,
  edgeOpacity: 0.4,
  sampleMode: 'top',
  simulationSpeed: 'fast',
  warmupTicks: 100,
  use3D: true,
  autoRotate: false,
  rotationSpeed: 0.15,
  linkDistance: 'long',
  repulsion: 'high',
  gravity: 'low',
};

/**
 * Convert hex color to RGBA array for deck.gl
 */
export function toRgbArray(hex: string, alpha = 255): [number, number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 0, alpha];
  return [rgb.r, rgb.g, rgb.b, alpha];
}

/**
 * Mix two hex colors and return RGBA array
 */
export function mixHex(
  hexA: string,
  hexB: string,
  t: number
): [number, number, number, number] {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return [0, 0, 0, 255];
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a.r + (b.r - a.r) * clamped),
    Math.round(a.g + (b.g - a.g) * clamped),
    Math.round(a.b + (b.b - a.b) * clamped),
    255,
  ];
}
