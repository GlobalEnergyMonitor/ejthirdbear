import { describe, expect, it } from 'vitest';
import {
  backgroundClickSuppressionDeadline,
  shouldIgnoreBackgroundClick,
  shouldTreatPointerReleaseAsNodeClick,
  shouldUseFallbackNodeClick,
} from './node-pointer-fallback';

describe('node pointer fallback helpers', () => {
  it('treats small pointer drift as a node click candidate', () => {
    expect(shouldTreatPointerReleaseAsNodeClick(100, 200, 103, 202, 4)).toBe(true);
    expect(shouldTreatPointerReleaseAsNodeClick(100, 200, 104, 202, 4)).toBe(false);
    expect(shouldTreatPointerReleaseAsNodeClick(100, 200, 103, 204, 4)).toBe(false);
  });

  it('skips fallback activation when the native click already landed on the same node', () => {
    expect(shouldUseFallbackNodeClick('E1', 1000, { id: 'E1', at: 980 })).toBe(false);
    expect(shouldUseFallbackNodeClick('E1', 1000, { id: 'E2', at: 980 })).toBe(true);
    expect(shouldUseFallbackNodeClick('E1', 1000, { id: 'E1', at: 900 })).toBe(true);
  });

  it('suppresses only the immediate background click window after a node press', () => {
    const suppressUntil = backgroundClickSuppressionDeadline(500);

    expect(shouldIgnoreBackgroundClick(560, suppressUntil)).toBe(true);
    expect(shouldIgnoreBackgroundClick(620, suppressUntil)).toBe(false);
  });
});
