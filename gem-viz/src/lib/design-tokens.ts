/**
 * @module design-tokens
 * @description THE SINGLE SOURCE OF TRUTH FOR ALL COLORS AND DESIGN VALUES.
 *
 * This file re-exports everything from focused sub-modules so all existing
 * imports (`from '$lib/design-tokens'`) continue to work unchanged.
 *
 * Sub-modules:
 *   tokens/colors.ts      — brand, tracker, status, map, ownership colors + Maps
 *   tokens/typography.ts  — fonts, sizes, weights, line heights, presets
 *   tokens/spacing.ts     — spacing/sizing constants
 *   tokens/color-utils.ts — hex/rgb/hsl conversions, opacity, tracker/status lookups
 *
 * CSS custom properties in shared-styles.css mirror these values.
 *
 * @example
 * import { colors, getTrackerColor, withOpacity } from '$lib/design-tokens';
 * const coalColor = getTrackerColor('Coal Plant');
 * const faded = withOpacity(coalColor, 0.5);
 */

export * from './tokens/colors';
export * from './tokens/typography';
export * from './tokens/spacing';
export * from './tokens/color-utils';
