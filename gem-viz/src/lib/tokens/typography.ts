/**
 * @module tokens/typography
 * Font families, sizes, weights, line heights, letter spacing, and presets.
 */

// =============================================================================
// TYPOGRAPHY - GEM Type Hierarchy
// Plus Jakarta Sans for UI, Barlow Semi-Condensed for Data/Stats (UPPERCASE)
// =============================================================================

export const fonts = {
  sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  display: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
  data: "'Barlow Semi-Condensed', 'Arial Narrow', sans-serif",
  mono: "'Barlow Semi-Condensed', 'Arial Narrow', sans-serif",
} as const;

export const fontSizes = {
  xs: '10px',
  sm: '12px',
  base: '14px',
  md: '16px',
  lg: '18px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
  '4xl': '56px',
  '5xl': '72px',
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

export const typography = {
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

  button: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wide,
  },

  emphasis: {
    fontFamily: fonts.sans,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase' as const,
    letterSpacing: letterSpacing.wider,
  },

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
