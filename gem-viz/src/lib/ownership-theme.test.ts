/**
 * Unit tests for ownership-theme
 *
 * Tests color utilities and status grouping functions.
 */

import { describe, it, expect } from 'vitest';
import {
  colors,
  regroupStatus,
  colorByTracker,
  colorByStatus,
  setColLightness,
  adjustColLightness,
  fossilTrackers,
  prospectiveStatuses,
  idFields,
  capacityFields,
} from './ownership-theme';

describe('colors', () => {
  it('has all primary brand colors', () => {
    expect(colors.navy).toBe('#004A63');
    expect(colors.mint).toBe('#9DF7E5');
    expect(colors.orange).toBe('#FE4F2D');
  });

  it('has all secondary colors', () => {
    expect(colors.deepRed).toBe('#7F142A');
    expect(colors.yellow).toBe('#FFE366');
    expect(colors.grey).toBe('#BECCCF');
  });
});

describe('regroupStatus', () => {
  it('groups operating statuses', () => {
    expect(regroupStatus('operating')).toBe('operating');
    expect(regroupStatus('Operating')).toBe('operating');
    expect(regroupStatus('operating pre-retirement')).toBe('operating');
  });

  it('groups proposed/construction statuses', () => {
    expect(regroupStatus('proposed')).toBe('proposed');
    expect(regroupStatus('announced')).toBe('proposed');
    expect(regroupStatus('pre-permit')).toBe('proposed');
    expect(regroupStatus('permitted')).toBe('proposed');
    expect(regroupStatus('pre-construction')).toBe('proposed');
    expect(regroupStatus('construction')).toBe('proposed');
  });

  it('groups retired statuses', () => {
    expect(regroupStatus('retired')).toBe('retired');
    expect(regroupStatus('mothballed')).toBe('retired');
    expect(regroupStatus('idle')).toBe('retired');
    expect(regroupStatus('mothballed pre-retirement')).toBe('retired');
  });

  it('groups cancelled statuses', () => {
    expect(regroupStatus('cancelled')).toBe('cancelled');
    expect(regroupStatus('shelved')).toBe('cancelled');
    expect(regroupStatus('cancelled - inferred 4 y')).toBe('cancelled');
    expect(regroupStatus('shelved - inferred 2 y')).toBe('cancelled');
  });

  it('returns unknown for unrecognized status', () => {
    expect(regroupStatus('weird status')).toBe('unknown');
    expect(regroupStatus('')).toBe('unknown');
    expect(regroupStatus(undefined)).toBe('unknown');
  });
});

describe('colorByTracker', () => {
  it('has colors for all fossil trackers', () => {
    expect(colorByTracker.get('Coal Plant')).toBe(colors.deepRed);
    expect(colorByTracker.get('Gas Plant')).toBe(colors.purple);
    expect(colorByTracker.get('Coal Mine')).toBeDefined();
  });

  it('has colors for industrial trackers', () => {
    expect(colorByTracker.get('Steel Plant')).toBe(colors.midnightGreen);
    expect(colorByTracker.get('Iron Ore Mine')).toBeDefined();
  });

  it('returns undefined for unknown trackers', () => {
    expect(colorByTracker.get('Unknown Tracker')).toBeUndefined();
  });
});

describe('colorByStatus', () => {
  it('maps operating to correct color', () => {
    expect(colorByStatus.get('operating')).toBeDefined();
  });

  it('maps proposed to correct color', () => {
    expect(colorByStatus.get('proposed')).toBe(colors.purple);
    expect(colorByStatus.get('construction')).toBe(colors.purple);
  });

  it('maps retired to midnight purple', () => {
    expect(colorByStatus.get('retired')).toBe(colors.midnightPurple);
  });

  it('maps cancelled to grey', () => {
    expect(colorByStatus.get('cancelled')).toBe(colors.grey);
  });
});

describe('setColLightness', () => {
  it('can set lightness to 0 (black)', () => {
    const result = setColLightness('#ff0000', 0);
    expect(result).toBe('#000000');
  });

  it('can set lightness to 1 (white)', () => {
    const result = setColLightness('#ff0000', 1);
    expect(result).toBe('#ffffff');
  });

  it('returns original color for invalid input', () => {
    const result = setColLightness('invalid', 0.5);
    expect(result).toBe('invalid');
  });
});

describe('adjustColLightness', () => {
  it('makes colors darker with pct < 1', () => {
    const original = '#808080'; // 50% grey
    const darker = adjustColLightness(original, 0.5);
    // Should be darker (lower hex values)
    expect(darker).not.toBe(original);
  });

  it('returns original color for invalid input', () => {
    const result = adjustColLightness('invalid', 0.5);
    expect(result).toBe('invalid');
  });
});

describe('fossilTrackers', () => {
  it('includes main fossil fuel types', () => {
    expect(fossilTrackers).toContain('Coal Plant');
    expect(fossilTrackers).toContain('Gas Plant');
    expect(fossilTrackers).toContain('Coal Mine');
    expect(fossilTrackers).toContain('Gas Pipeline');
  });

  it('has exactly 4 trackers', () => {
    expect(fossilTrackers).toHaveLength(4);
  });
});

describe('prospectiveStatuses', () => {
  it('includes all pre-operating statuses', () => {
    expect(prospectiveStatuses).toContain('proposed');
    expect(prospectiveStatuses).toContain('announced');
    expect(prospectiveStatuses).toContain('pre-permit');
    expect(prospectiveStatuses).toContain('permitted');
    expect(prospectiveStatuses).toContain('pre-construction');
    expect(prospectiveStatuses).toContain('construction');
  });

  it('does not include operating', () => {
    expect(prospectiveStatuses).not.toContain('operating');
  });
});

describe('idFields', () => {
  it('maps tracker to correct ID field', () => {
    expect(idFields.get('Coal Plant')).toBe('GEM unit ID');
    expect(idFields.get('Gas Plant')).toBe('GEM unit ID');
    expect(idFields.get('Coal Mine')).toBe('GEM Mine ID');
    expect(idFields.get('Steel Plant')).toBe('Steel Plant ID');
  });
});

describe('capacityFields', () => {
  it('maps tracker to correct capacity field', () => {
    expect(capacityFields.get('Coal Plant')).toBe('Capacity (MW)');
    expect(capacityFields.get('Gas Plant')).toBe('Capacity (MW)');
    expect(capacityFields.get('Coal Mine')).toBe('Capacity (Mtpa)');
  });
});
